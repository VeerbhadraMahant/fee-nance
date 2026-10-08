/**
 * Recurring charges the ledger shows but no recurring rule covers.
 *
 * Kept apart from the main insights route: that one is a set of SQL window
 * functions, while this needs the payee normalisation and frequency
 * bucketing in `lib/recurring-detect.ts`, which don't translate cleanly into
 * SQL.
 */

import { requireUser } from "@/lib/api-auth";
import { cached } from "@/lib/cache";
import { roundCurrency } from "@/lib/money";
import { detectRecurring, normalizePayee } from "@/lib/recurring-detect";
import { handleRouteError, must, selectAll } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/** Long enough to see three quarterly charges; yearly ones need history. */
const LOOKBACK_DAYS = 400;

async function buildRecurring(supabase: SupabaseServerClient) {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

  const [expenses, rules] = await Promise.all([
    selectAll<ExpenseRow>((from, to) =>
      supabase
        .from("transactions")
        .select("id, title, amount, transaction_date, categories(name)")
        .eq("type", "expense")
        .gte("transaction_date", since.toISOString())
        .order("transaction_date")
        .order("id")
        .range(from, to)
        .overrideTypes<ExpenseRow[], { merge: false }>(),
    ),
    supabase.from("transactions").select("title").eq("type", "expense").eq("recurring_enabled", true).then(must),
  ]);

  // A payee that already has a rule is accounted for in the forecast.
  const covered = new Set(((rules ?? []) as Array<{ title: string }>).map((rule) => normalizePayee(rule.title)));

  const detected = detectRecurring(
    expenses.map((e) => ({
      id: e.id,
      title: e.title,
      amount: Number(e.amount),
      date: new Date(e.transaction_date),
      categoryName: e.categories?.name ?? "Uncategorized",
    })),
  ).filter((item) => !covered.has(item.key));

  return {
    items: detected,
    monthlyTotal: roundCurrency(detected.reduce((sum, item) => sum + item.monthlyCost, 0)),
    overlapCount: detected.filter((item) => item.overlapGroup).length,
  };
}

interface ExpenseRow {
  id: string;
  title: string;
  amount: number;
  transaction_date: string;
  categories: { name: string } | null;
}

export async function GET() {
  try {
    const { supabase, userId } = await requireUser();
    const payload = await cached(userId, "recurring", null, () => buildRecurring(supabase));
    return Response.json(payload);
  } catch (error) {
    return handleRouteError(error, "Failed to detect recurring charges");
  }
}
