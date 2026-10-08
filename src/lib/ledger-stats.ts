import type { Types } from "mongoose";

import { roundCurrency } from "@/lib/money";
import { Transaction } from "@/models/Transaction";

export interface MonthTotals {
  year: number;
  month: number;
  income: number;
  expense: number;
}

/**
 * Income and expense for each of the last `months` *completed* calendar
 * months (oldest first, zero-filled), plus the all-time balance.
 *
 * The running month is left out on purpose: two weeks into October, October
 * always looks like a great savings month because rent is in and the rest
 * isn't yet. Scoring on partial months rewards the calendar, not behaviour.
 */
export async function completedMonthTotals(
  userId: Types.ObjectId,
  months: number,
  now: Date = new Date(),
) {
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const windowStart = new Date(now.getFullYear(), now.getMonth() - months, 1);

  const [monthlyRows, balanceRows] = await Promise.all([
    Transaction.aggregate<{ _id: { year: number; month: number }; income: number; expense: number }>([
      {
        $match: {
          userId,
          transactionDate: { $gte: windowStart, $lt: thisMonthStart },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$transactionDate" },
            month: { $month: "$transactionDate" },
          },
          income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
          expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
        },
      },
    ]),
    Transaction.aggregate<{ _id: "income" | "expense"; total: number }>([
      { $match: { userId, transactionDate: { $lt: now } } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]),
  ]);

  const byKey = new Map(monthlyRows.map((row) => [`${row._id.year}-${row._id.month}`, row]));
  const series: MonthTotals[] = [];
  for (let i = months; i >= 1; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const row = byKey.get(`${year}-${month}`);
    series.push({
      year,
      month,
      income: roundCurrency(row?.income ?? 0),
      expense: roundCurrency(row?.expense ?? 0),
    });
  }

  const income = balanceRows.find((r) => r._id === "income")?.total ?? 0;
  const expense = balanceRows.find((r) => r._id === "expense")?.total ?? 0;

  // Leading empty months are "before the user started", not "spent nothing".
  const firstActive = series.findIndex((m) => m.income > 0 || m.expense > 0);
  const active = firstActive === -1 ? [] : series.slice(firstActive);

  return { months: active, balance: roundCurrency(income - expense) };
}

/** Average monthly surplus over the trailing `window` active months, floored at 0. */
export function averageSurplus(months: MonthTotals[], window = 3) {
  const recent = months.slice(-window);
  if (!recent.length) return 0;
  const net = recent.reduce((sum, m) => sum + m.income - m.expense, 0) / recent.length;
  return Math.max(0, roundCurrency(net));
}
