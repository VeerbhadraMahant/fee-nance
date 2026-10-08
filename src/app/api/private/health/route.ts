/**
 * Financial health score for the signed-in user. The scoring itself is the
 * pure `computeHealthScore`; this handler only gathers its inputs.
 */

import { requireUserId } from "@/lib/api-auth";
import { spendByBudget } from "@/lib/budget-spend";
import { connectToDatabase } from "@/lib/db";
import { computeHealthScore } from "@/lib/health-score";
import { jsonError } from "@/lib/http";
import { completedMonthTotals } from "@/lib/ledger-stats";
import { logger } from "@/lib/logger";
import { toObjectId } from "@/lib/object-id";
import { Budget } from "@/models/Budget";

/** Months of history the cash-flow and consistency pillars look across. */
const HISTORY_MONTHS = 6;
/** Trailing window for the savings rate. */
const SAVINGS_MONTHS = 3;

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectToDatabase();

    const userObjectId = toObjectId(userId);
    const now = new Date();

    const [stats, activeBudgets] = await Promise.all([
      completedMonthTotals(userObjectId, HISTORY_MONTHS, now),
      Budget.find({
        userId: userObjectId,
        periodStart: { $lte: now },
        periodEnd: { $gte: now },
      })
        .select("_id amount categoryId periodStart periodEnd")
        .lean(),
    ]);

    const spent = await spendByBudget(userObjectId, activeBudgets);
    const budgetUtilisation = activeBudgets
      .filter((budget) => budget.amount > 0)
      .map((budget) => (spent.get(budget._id.toString()) ?? 0) / budget.amount);

    const recent = stats.months.slice(-SAVINGS_MONTHS);

    const score = computeHealthScore({
      monthlyNets: stats.months.map((m) => m.income - m.expense),
      monthlyExpenses: stats.months.map((m) => m.expense),
      trailingIncome: recent.reduce((s, m) => s + m.income, 0),
      trailingExpense: recent.reduce((s, m) => s + m.expense, 0),
      balance: stats.balance,
      budgetUtilisation,
    });

    return Response.json({
      ...score,
      monthsOfHistory: stats.months.length,
      computedAt: now,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    logger.error("Health score API error", error);
    return jsonError("Failed to compute health score", 500);
  }
}
