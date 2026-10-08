import { must } from "@/lib/route";
import { roundCurrency } from "@/lib/money";
import type { SupabaseServerClient } from "@/lib/supabase/server";

export interface MonthTotals {
  year: number;
  month: number;
  income: number;
  expense: number;
}

/**
 * Income and expense for each of the last `months` *completed* calendar
 * months (oldest first, zero-filled), plus the balance as of `now`.
 *
 * The running month is left out on purpose: two weeks into October, October
 * always looks like a great savings month because rent is in and the rest
 * isn't yet. Scoring on partial months rewards the calendar, not behaviour.
 */
export async function completedMonthTotals(
  supabase: SupabaseServerClient,
  months: number,
  now: Date = new Date(),
) {
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const windowStart = new Date(now.getFullYear(), now.getMonth() - months, 1);

  const [monthlyRows, balance] = await Promise.all([
    supabase
      .rpc("ledger_monthly_totals", {
        p_start: windowStart.toISOString(),
        p_end: thisMonthStart.toISOString(),
        p_end_exclusive: true,
      })
      .then(must),
    supabase.rpc("ledger_balance_before", { p_before: now.toISOString() }).then(must),
  ]);

  const rows = (monthlyRows ?? []) as Array<{ year: number; month: number; income: number; expense: number }>;
  const byKey = new Map(rows.map((row) => [`${row.year}-${row.month}`, row]));
  const series: MonthTotals[] = [];
  for (let i = months; i >= 1; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const row = byKey.get(`${year}-${month}`);
    series.push({
      year,
      month,
      income: roundCurrency(Number(row?.income ?? 0)),
      expense: roundCurrency(Number(row?.expense ?? 0)),
    });
  }

  // Leading empty months are "before the user started", not "spent nothing".
  const firstActive = series.findIndex((m) => m.income > 0 || m.expense > 0);
  const active = firstActive === -1 ? [] : series.slice(firstActive);

  return { months: active, balance: roundCurrency(Number(balance ?? 0)) };
}

/** Average monthly surplus over the trailing `window` active months, floored at 0. */
export function averageSurplus(months: MonthTotals[], window = 3) {
  const recent = months.slice(-window);
  if (!recent.length) return 0;
  const net = recent.reduce((sum, m) => sum + m.income - m.expense, 0) / recent.length;
  return Math.max(0, roundCurrency(net));
}
