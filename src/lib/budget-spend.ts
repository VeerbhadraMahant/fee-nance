import { must } from "@/lib/route";
import { roundCurrency } from "@/lib/money";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/**
 * Spend against each budget, in one query (the `budget_spend` SQL function
 * joins every budget to the expenses inside its own period and category).
 * Budgets the caller can't see are simply absent from the result.
 */
export async function spendByBudget(
  supabase: SupabaseServerClient,
  budgetIds: string[],
): Promise<Map<string, number>> {
  if (!budgetIds.length) return new Map();
  const rows = must(await supabase.rpc("budget_spend", { p_budget_ids: budgetIds })) as Array<{
    budget_id: string;
    spent: number;
  }>;
  return new Map(rows.map((row) => [row.budget_id, roundCurrency(Number(row.spent))]));
}
