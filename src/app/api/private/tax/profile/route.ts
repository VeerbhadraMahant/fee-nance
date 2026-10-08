/**
 * Pre-fill for the tax planner: trailing-year income and deduction hints read
 * from the ledger. The regime calculation itself runs client-side (pure
 * `lib/tax.ts`) so the what-if inputs respond without a round trip.
 */

import { requireUser } from "@/lib/api-auth";
import { cached } from "@/lib/cache";
import { roundCurrency } from "@/lib/money";
import { handleRouteError, must, selectAll } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import { detectDeductionHints } from "@/lib/tax";

interface ExpenseRow {
  title: string;
  amount: number;
  categories: { name: string } | null;
}

async function buildProfile(supabase: SupabaseServerClient) {
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  const [totals, expenses, first] = await Promise.all([
    supabase
      .rpc("ledger_type_totals", { p_start: new Date(yearAgo.getTime() + 1).toISOString(), p_end: now.toISOString() })
      .then(must),
    selectAll<ExpenseRow>((from, to) =>
      supabase
        .from("transactions")
        .select("title, amount, categories(name)")
        .eq("type", "expense")
        .gt("transaction_date", yearAgo.toISOString())
        .lte("transaction_date", now.toISOString())
        .order("id")
        .range(from, to)
        .overrideTypes<ExpenseRow[], { merge: false }>(),
    ),
    supabase
      .from("transactions")
      .select("transaction_date")
      .order("transaction_date", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(must),
  ]);

  const hints = detectDeductionHints(
    expenses.map((e) => ({
      title: e.title,
      amount: Number(e.amount),
      categoryName: e.categories?.name ?? null,
    })),
  );

  // With less than a year of history, annualise what is there instead of
  // reporting a part-year as the annual figure.
  const observedIncome = Number(
    ((totals ?? []) as Array<{ type: string; total: number }>).find((t) => t.type === "income")?.total ?? 0,
  );
  const firstDate = first?.transaction_date ? new Date(first.transaction_date as string) : null;
  const observedDays = firstDate
    ? Math.min(365, Math.max(1, (now.getTime() - Math.max(firstDate.getTime(), yearAgo.getTime())) / 86_400_000))
    : 365;
  const annualised = observedDays < 330;
  const annualIncome = roundCurrency(annualised ? (observedIncome / observedDays) * 365 : observedIncome);

  return {
    annualIncome,
    observedIncome: roundCurrency(observedIncome),
    annualised,
    observedDays: Math.round(observedDays),
    hints,
  };
}

export async function GET() {
  try {
    const { supabase, userId } = await requireUser();
    const payload = await cached(userId, "tax-profile", null, () => buildProfile(supabase));
    return Response.json(payload);
  } catch (error) {
    return handleRouteError(error, "Failed to load tax profile");
  }
}
