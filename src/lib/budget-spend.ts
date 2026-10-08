import type { Types } from "mongoose";

import { Transaction } from "@/models/Transaction";

export interface BudgetWindow {
  _id: Types.ObjectId | string;
  categoryId?: Types.ObjectId | string | null;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Spend against each budget, in one aggregation instead of one per budget.
 *
 * Expenses across the union of all budget periods are folded to one row per
 * (category, day), then each budget sums the rows inside its own window. The
 * row count is bounded by days × categories, not by transaction count, so
 * this stays cheap however busy the ledger is.
 *
 * Day granularity is in UTC, matching how budget periods are written
 * (`T00:00:00.000Z` to `T23:59:59.999Z`).
 */
export async function spendByBudget(
  userId: Types.ObjectId,
  budgets: BudgetWindow[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!budgets.length) return result;

  const from = new Date(Math.min(...budgets.map((b) => new Date(b.periodStart).getTime())));
  const to = new Date(Math.max(...budgets.map((b) => new Date(b.periodEnd).getTime())));

  const rows = await Transaction.aggregate<{
    _id: { categoryId: Types.ObjectId | null; day: string };
    total: number;
  }>([
    {
      $match: {
        userId,
        type: "expense",
        transactionDate: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: {
          categoryId: "$categoryId",
          day: { $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" } },
        },
        total: { $sum: "$amount" },
      },
    },
  ]);

  for (const budget of budgets) {
    const start = new Date(budget.periodStart).toISOString().slice(0, 10);
    const end = new Date(budget.periodEnd).toISOString().slice(0, 10);
    const category = budget.categoryId ? budget.categoryId.toString() : null;

    let spent = 0;
    for (const row of rows) {
      if (row._id.day < start || row._id.day > end) continue;
      if (category && row._id.categoryId?.toString() !== category) continue;
      spent += row.total;
    }
    result.set(budget._id.toString(), Math.round(spent * 100) / 100);
  }

  return result;
}
