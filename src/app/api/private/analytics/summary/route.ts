import { requireUser } from "@/lib/api-auth";
import { cached } from "@/lib/cache";
import { parseDate } from "@/lib/http";
import { handleRouteError, must } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

// Keywords in category names that classify an expense as a "deduction"
const DEDUCTION_KEYWORDS = [
  "tax", "insurance", "emi", "loan", "provident", "pf", "epf", "tds",
  "gst", "levy", "premium", "pension",
];

function isDeductionCategory(name: string) {
  const lower = name.toLowerCase();
  return DEDUCTION_KEYWORDS.some((kw) => lower.includes(kw));
}

type CategoryTotal = { category_id: string | null; category_name: string; total: number };
type PeriodTotal = { year: number; income: number; expense: number };

async function buildAnalytics(supabase: SupabaseServerClient, startDate: Date, endDate: Date) {
  const range = { p_start: startDate.toISOString(), p_end: endDate.toISOString() };

  const [typeTotals, expenseRows, incomeRows, monthlyRows, quarterlyRows] = await Promise.all([
    supabase.rpc("ledger_type_totals", range).then(must),
    supabase.rpc("ledger_category_totals", { ...range, p_type: "expense" }).then(must),
    supabase.rpc("ledger_category_totals", { ...range, p_type: "income" }).then(must),
    supabase.rpc("ledger_monthly_totals", range).then(must),
    supabase.rpc("ledger_quarterly_totals", range).then(must),
  ]);

  const totals = (typeTotals ?? []) as Array<{ type: string; total: number }>;
  const grossIncome = Number(totals.find((t) => t.type === "income")?.total ?? 0);
  const totalExpenses = Number(totals.find((t) => t.type === "expense")?.total ?? 0);

  const expenseCategories = ((expenseRows ?? []) as CategoryTotal[]).map((row) => ({
    categoryId: row.category_id,
    categoryName: row.category_name,
    total: Number(row.total),
    isDeduction: isDeductionCategory(row.category_name),
  }));

  const totalDeductions = expenseCategories
    .filter((e) => e.isDeduction)
    .reduce((sum, e) => sum + e.total, 0);

  const netIncome = grossIncome - totalDeductions;
  const netSavings = grossIncome - totalExpenses;

  return {
    dateRange: { startDate, endDate },
    summary: {
      grossIncome,
      totalDeductions,
      netIncome,
      totalExpenses,
      netSavings,
      savingsRate: grossIncome > 0 ? (netSavings / grossIncome) * 100 : 0,
      expenseRatio: grossIncome > 0 ? (totalExpenses / grossIncome) * 100 : 0,
    },
    categoryBreakdown: expenseCategories.map((e) => ({
      ...e,
      percentage: totalExpenses > 0 ? (e.total / totalExpenses) * 100 : 0,
    })),
    incomeBreakdown: ((incomeRows ?? []) as CategoryTotal[]).map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      total: Number(row.total),
      percentage: grossIncome > 0 ? (Number(row.total) / grossIncome) * 100 : 0,
    })),
    monthlyTrend: ((monthlyRows ?? []) as Array<PeriodTotal & { month: number }>).map((row) => ({
      year: row.year,
      month: row.month,
      income: Number(row.income),
      expense: Number(row.expense),
      savings: Number(row.income) - Number(row.expense),
    })),
    quarterlyData: ((quarterlyRows ?? []) as Array<PeriodTotal & { quarter: number }>).map((row) => ({
      label: `Q${row.quarter} ${row.year}`,
      income: Number(row.income),
      expense: Number(row.expense),
      savings: Number(row.income) - Number(row.expense),
    })),
  };
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireUser();
    const { searchParams } = new URL(request.url);

    // Default: last 12 months
    const defaultEnd = new Date();
    const defaultStart = new Date(defaultEnd);
    defaultStart.setMonth(defaultStart.getMonth() - 11);
    defaultStart.setDate(1);
    defaultStart.setHours(0, 0, 0, 0);

    const startDate = parseDate(searchParams.get("startDate"), defaultStart) as Date;
    const endDate = parseDate(searchParams.get("endDate"), defaultEnd) as Date;

    const payload = await cached(
      userId,
      "analytics",
      { start: startDate.toISOString(), end: endDate.toISOString() },
      () => buildAnalytics(supabase, startDate, endDate),
    );
    return Response.json(payload);
  } catch (error) {
    return handleRouteError(error, "Failed to load analytics data");
  }
}
