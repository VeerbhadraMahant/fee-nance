import { requireUser } from "@/lib/api-auth";
import { spendByBudget } from "@/lib/budget-spend";
import { cached } from "@/lib/cache";
import { parseDate } from "@/lib/http";
import { handleRouteError, must } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

async function buildSummary(supabase: SupabaseServerClient, startDate: Date, endDate: Date) {
  const range = { p_start: startDate.toISOString(), p_end: endDate.toISOString() };

  const [typeTotals, categoryTotals, monthly, groupCount, budgets] = await Promise.all([
    supabase.rpc("ledger_type_totals", range).then(must),
    supabase.rpc("ledger_category_totals", { ...range, p_type: "expense" }).limit(6).then(must),
    supabase.rpc("ledger_monthly_totals", range).then(must),
    // RLS limits this to groups the caller belongs to; head: true skips the rows.
    supabase
      .from("groups")
      .select("id", { count: "exact", head: true })
      .then((result) => {
        must(result);
        return result.count ?? 0;
      }),
    supabase
      .from("budgets")
      .select("id, name, amount")
      .lte("period_start", range.p_end)
      .gte("period_end", range.p_start)
      .then(must),
  ]);

  const totals = (typeTotals ?? []) as Array<{ type: string; total: number }>;
  const income = Number(totals.find((t) => t.type === "income")?.total ?? 0);
  const expense = Number(totals.find((t) => t.type === "expense")?.total ?? 0);

  const budgetRows = (budgets ?? []) as Array<{ id: string; name: string; amount: number }>;
  const spent = await spendByBudget(supabase, budgetRows.map((b) => b.id));
  const budgetAlerts = budgetRows
    .map((budget) => {
      const limit = Number(budget.amount);
      const used = spent.get(budget.id) ?? 0;
      const pct = limit > 0 ? (used / limit) * 100 : 0;
      return { _id: budget.id, name: budget.name, amount: limit, spent: used, pct, over: used > limit };
    })
    .filter((b) => b.pct >= 80)
    .sort((a, b) => b.pct - a.pct);

  return {
    dateRange: { startDate, endDate },
    totals: { income, expense, balance: income - expense },
    groupCount,
    budgetAlerts,
    categoryBreakdown: (
      (categoryTotals ?? []) as Array<{ category_id: string | null; category_name: string; total: number }>
    ).map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      total: Number(row.total),
    })),
    monthlyTrend: (
      (monthly ?? []) as Array<{ year: number; month: number; income: number; expense: number }>
    ).map((row) => ({
      year: row.year,
      month: row.month,
      income: Number(row.income),
      expense: Number(row.expense),
    })),
  };
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireUser();
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const startDate = parseDate(searchParams.get("startDate"), new Date(now.getFullYear(), now.getMonth(), 1)) as Date;
    const endDate = parseDate(searchParams.get("endDate"), now) as Date;

    const payload = await cached(
      userId,
      "dashboard",
      { start: startDate.toISOString(), end: endDate.toISOString() },
      () => buildSummary(supabase, startDate, endDate),
    );
    return Response.json(payload);
  } catch (error) {
    return handleRouteError(error, "Failed to load dashboard summary");
  }
}
