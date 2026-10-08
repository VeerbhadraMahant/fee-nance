/**
 * Financial health score for the signed-in user. The scoring itself is the
 * pure `computeHealthScore`; this handler only gathers its inputs.
 */

import { requireUser } from "@/lib/api-auth";
import { spendByBudget } from "@/lib/budget-spend";
import { cached } from "@/lib/cache";
import { computeHealthScore } from "@/lib/health-score";
import { completedMonthTotals } from "@/lib/ledger-stats";
import { handleRouteError, must } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/** Months of history the cash-flow and consistency pillars look across. */
const HISTORY_MONTHS = 6;
/** Trailing window for the savings rate. */
const SAVINGS_MONTHS = 3;

async function buildHealth(supabase: SupabaseServerClient) {
  const now = new Date();

  const [stats, activeBudgets] = await Promise.all([
    completedMonthTotals(supabase, HISTORY_MONTHS, now),
    supabase
      .from("budgets")
      .select("id, amount")
      .lte("period_start", now.toISOString())
      .gte("period_end", now.toISOString())
      .then(must),
  ]);

  const budgets = ((activeBudgets ?? []) as Array<{ id: string; amount: number }>).filter(
    (budget) => Number(budget.amount) > 0,
  );
  const spent = await spendByBudget(supabase, budgets.map((b) => b.id));
  const budgetUtilisation = budgets.map((b) => (spent.get(b.id) ?? 0) / Number(b.amount));

  const recent = stats.months.slice(-SAVINGS_MONTHS);

  const score = computeHealthScore({
    monthlyNets: stats.months.map((m) => m.income - m.expense),
    monthlyExpenses: stats.months.map((m) => m.expense),
    trailingIncome: recent.reduce((s, m) => s + m.income, 0),
    trailingExpense: recent.reduce((s, m) => s + m.expense, 0),
    balance: stats.balance,
    budgetUtilisation,
  });

  return { ...score, monthsOfHistory: stats.months.length, computedAt: now };
}

export async function GET() {
  try {
    const { supabase, userId } = await requireUser();
    const payload = await cached(userId, "health", null, () => buildHealth(supabase));
    return Response.json(payload);
  } catch (error) {
    return handleRouteError(error, "Failed to compute health score");
  }
}
