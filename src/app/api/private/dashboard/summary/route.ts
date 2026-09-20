import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { parseDate, jsonError } from "@/lib/http";
import { toObjectId } from "@/lib/object-id";
import { logger } from "@/lib/logger";
import { Budget } from "@/models/Budget";
import { Category } from "@/models/Category";
import { Group } from "@/models/Group";
import { Transaction } from "@/models/Transaction";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    await connectToDatabase();

    const userObjectId = toObjectId(userId);
    const { searchParams } = new URL(request.url);

    const defaultStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const defaultEnd = new Date();

    const startDate = parseDate(searchParams.get("startDate"), defaultStart) as Date;
    const endDate = parseDate(searchParams.get("endDate"), defaultEnd) as Date;

    const transactionMatch = {
      userId: userObjectId,
      transactionDate: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    const [summaryByType, categoryBreakdownRaw, monthlyTrend, groupCount, budgetsRaw] = await Promise.all([
      Transaction.aggregate([
        { $match: transactionMatch },
        {
          $group: {
            _id: "$type",
            total: { $sum: "$amount" },
          },
        },
      ]),
      Transaction.aggregate([
        { $match: { ...transactionMatch, type: "expense" } },
        {
          $group: {
            _id: "$categoryId",
            total: { $sum: "$amount" },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 6 },
      ]),
      Transaction.aggregate([
        { $match: transactionMatch },
        {
          $group: {
            _id: {
              year: { $year: "$transactionDate" },
              month: { $month: "$transactionDate" },
            },
            income: {
              $sum: {
                $cond: [{ $eq: ["$type", "income"] }, "$amount", 0],
              },
            },
            expense: {
              $sum: {
                $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0],
              },
            },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),
      Group.countDocuments({ "members.userId": userObjectId }),
      Budget.find({
        userId: userObjectId,
        periodStart: { $lte: endDate },
        periodEnd: { $gte: startDate },
      }).lean(),
    ]);

    const budgets = await Promise.all(
      budgetsRaw.map(async (budget) => {
        const spendMatch: Record<string, unknown> = {
          userId: userObjectId,
          type: "expense",
          transactionDate: { $gte: budget.periodStart, $lte: budget.periodEnd },
        };
        if (budget.categoryId) {
          spendMatch.categoryId = budget.categoryId;
        }

        const [spendResult] = await Transaction.aggregate([
          { $match: spendMatch },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]);

        const spent = spendResult?.total ?? 0;
        const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

        return {
          _id: budget._id.toString(),
          name: budget.name,
          amount: budget.amount,
          spent,
          pct,
          over: spent > budget.amount,
        };
      }),
    );

    const budgetAlerts = budgets.filter((b) => b.pct >= 80).sort((a, b) => b.pct - a.pct);

    const totalIncome = summaryByType.find((entry) => entry._id === "income")?.total ?? 0;
    const totalExpense = summaryByType.find((entry) => entry._id === "expense")?.total ?? 0;

    const categoryIds = categoryBreakdownRaw
      .map((entry) => entry._id)
      .filter((id): id is string => Boolean(id));

    const categories = await Category.find({ _id: { $in: categoryIds } })
      .select("_id name")
      .lean();

    const categoryMap = new Map(categories.map((category) => [category._id.toString(), category.name]));

    return Response.json({
      dateRange: {
        startDate,
        endDate,
      },
      totals: {
        income: totalIncome,
        expense: totalExpense,
        balance: totalIncome - totalExpense,
      },
      groupCount,
      budgetAlerts,
      categoryBreakdown: categoryBreakdownRaw.map((entry) => ({
        categoryId: entry._id,
        categoryName: categoryMap.get(entry._id?.toString?.() ?? "") ?? "Uncategorized",
        total: entry.total,
      })),
      monthlyTrend: monthlyTrend.map((entry) => ({
        year: entry._id.year,
        month: entry._id.month,
        income: entry.income,
        expense: entry.expense,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    logger.error("Unhandled API route error", error);
    return jsonError("Failed to load dashboard summary", 500);
  }
}
