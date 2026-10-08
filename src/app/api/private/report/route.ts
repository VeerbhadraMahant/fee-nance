/**
 * Data for the printable monthly report: one calendar month's totals,
 * where the money went, how budgets held, and the health score as it stood
 * at the end of that month (not today's score backdated).
 */

import { requireUserId } from "@/lib/api-auth";
import { spendByBudget } from "@/lib/budget-spend";
import { connectToDatabase } from "@/lib/db";
import { computeHealthScore } from "@/lib/health-score";
import { jsonError } from "@/lib/http";
import { completedMonthTotals } from "@/lib/ledger-stats";
import { logger } from "@/lib/logger";
import { roundCurrency } from "@/lib/money";
import { toObjectId } from "@/lib/object-id";
import { Budget } from "@/models/Budget";
import { Category } from "@/models/Category";
import { Goal } from "@/models/Goal";
import { Transaction } from "@/models/Transaction";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const fallback = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const match = MONTH_RE.exec(searchParams.get("month") ?? "");
    const year = match ? Number(match[1]) : fallback.getFullYear();
    const month = match ? Number(match[2]) : fallback.getMonth() + 1;

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    if (start > now) {
      return jsonError("That month hasn't started yet", 422);
    }

    await connectToDatabase();
    const userObjectId = toObjectId(userId);
    const inMonth = { userId: userObjectId, transactionDate: { $gte: start, $lt: end } };

    const [stats, byCategory, topExpenses, budgets, goals, count] = await Promise.all([
      // Six months ending with the report month, measured as of its last day.
      completedMonthTotals(userObjectId, 6, end),
      Transaction.aggregate<{ _id: { type: string; categoryId: unknown }; total: number; count: number }>([
        { $match: inMonth },
        {
          $group: {
            _id: { type: "$type", categoryId: "$categoryId" },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),
      Transaction.find({ ...inMonth, type: "expense" })
        .sort({ amount: -1 })
        .limit(5)
        .select("title amount categoryId transactionDate")
        .lean(),
      Budget.find({
        userId: userObjectId,
        periodStart: { $lt: end },
        periodEnd: { $gte: start },
      })
        .select("_id name amount categoryId periodStart periodEnd")
        .lean(),
      Goal.find({ userId: userObjectId }).select("name targetAmount savedAmount targetDate").lean(),
      Transaction.countDocuments(inMonth),
    ]);

    const categoryIds = [
      ...byCategory.map((row) => row._id.categoryId),
      ...topExpenses.map((row) => row.categoryId),
    ].filter(Boolean);
    const categories = await Category.find({ _id: { $in: categoryIds } }).select("_id name").lean();
    const categoryName = new Map(categories.map((c) => [c._id.toString(), c.name as string]));
    const nameOf = (id: unknown) => categoryName.get(id?.toString?.() ?? "") ?? "Uncategorised";

    const spent = await spendByBudget(userObjectId, budgets);

    const current = stats.months.at(-1);
    const previous = stats.months.at(-2) ?? null;
    const income = current?.income ?? 0;
    const expense = current?.expense ?? 0;

    const recent = stats.months.slice(-3);
    const health = computeHealthScore({
      monthlyNets: stats.months.map((m) => m.income - m.expense),
      monthlyExpenses: stats.months.map((m) => m.expense),
      trailingIncome: recent.reduce((s, m) => s + m.income, 0),
      trailingExpense: recent.reduce((s, m) => s + m.expense, 0),
      balance: stats.balance,
      budgetUtilisation: budgets
        .filter((b) => b.amount > 0)
        .map((b) => (spent.get(b._id.toString()) ?? 0) / b.amount),
    });

    return Response.json({
      period: { year, month, start, end },
      transactionCount: count,
      totals: {
        income: roundCurrency(income),
        expense: roundCurrency(expense),
        net: roundCurrency(income - expense),
        savingsRate: income > 0 ? (income - expense) / income : null,
        closingBalance: stats.balance,
      },
      previous: previous
        ? {
            income: previous.income,
            expense: previous.expense,
            net: roundCurrency(previous.income - previous.expense),
          }
        : null,
      expenseByCategory: byCategory
        .filter((row) => row._id.type === "expense")
        .map((row) => ({
          categoryName: nameOf(row._id.categoryId),
          total: roundCurrency(row.total),
          count: row.count,
        })),
      incomeByCategory: byCategory
        .filter((row) => row._id.type === "income")
        .map((row) => ({
          categoryName: nameOf(row._id.categoryId),
          total: roundCurrency(row.total),
          count: row.count,
        })),
      topExpenses: topExpenses.map((row) => ({
        id: row._id.toString(),
        title: row.title,
        amount: row.amount,
        categoryName: nameOf(row.categoryId),
        transactionDate: row.transactionDate,
      })),
      budgets: budgets.map((b) => {
        const used = spent.get(b._id.toString()) ?? 0;
        return {
          id: b._id.toString(),
          name: b.name,
          limit: b.amount,
          spent: used,
          pct: b.amount > 0 ? (used / b.amount) * 100 : 0,
        };
      }),
      goals: goals.map((g) => ({
        id: g._id.toString(),
        name: g.name,
        targetAmount: g.targetAmount,
        savedAmount: g.savedAmount,
        targetDate: g.targetDate ?? null,
      })),
      health,
      generatedAt: now,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    logger.error("Report API error", error);
    return jsonError("Failed to build the report", 500);
  }
}
