/**
 * Data for the printable monthly report: one calendar month's totals,
 * where the money went, how budgets held, and the health score as it stood
 * at the end of that month (not today's score backdated).
 */

import { requireUser } from "@/lib/api-auth";
import { spendByBudget } from "@/lib/budget-spend";
import { cached } from "@/lib/cache";
import { computeHealthScore } from "@/lib/health-score";
import { jsonError } from "@/lib/http";
import { completedMonthTotals } from "@/lib/ledger-stats";
import { roundCurrency } from "@/lib/money";
import { handleRouteError, must } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

type CategoryTotal = { category_name: string; total: number; txn_count: number };

async function buildReport(supabase: SupabaseServerClient, year: number, month: number, now: Date) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  // ledger_category_totals takes an inclusive end; stop a millisecond short of the next month.
  const range = { p_start: start.toISOString(), p_end: new Date(end.getTime() - 1).toISOString() };

  const [stats, expenseTotals, incomeTotals, topExpenses, budgets, goals, countResult] = await Promise.all([
    // Six months ending with the report month, measured as of its last day.
    completedMonthTotals(supabase, 6, end),
    supabase.rpc("ledger_category_totals", { ...range, p_type: "expense" }).then(must),
    supabase.rpc("ledger_category_totals", { ...range, p_type: "income" }).then(must),
    supabase
      .from("transactions")
      .select("id, title, amount, transaction_date, categories(name)")
      .eq("type", "expense")
      .gte("transaction_date", start.toISOString())
      .lt("transaction_date", end.toISOString())
      .order("amount", { ascending: false })
      .limit(5)
      .then(must),
    supabase
      .from("budgets")
      .select("id, name, amount")
      .lt("period_start", end.toISOString())
      .gte("period_end", start.toISOString())
      .then(must),
    supabase.from("goals").select("id, name, target_amount, saved_amount, target_date").then(must),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .gte("transaction_date", start.toISOString())
      .lt("transaction_date", end.toISOString()),
  ]);
  must(countResult);

  const budgetRows = (budgets ?? []) as Array<{ id: string; name: string; amount: number }>;
  const spent = await spendByBudget(supabase, budgetRows.map((b) => b.id));

  const current = stats.months.at(-1);
  const previous = stats.months.at(-2) ?? null;
  const income = current?.income ?? 0;
  const expense = current?.expense ?? 0;

  const recent = stats.months.slice(-3);
  const health = computeHealthScore({
    monthlyNets: stats.months.map((m) => m.income - m.expense),
    monthlyExpenses: stats.months.map((m) => m.expense),
    trailingIncome: recent.reduce((s, m) => s + m.income, 0),
    trailingExpense: recent.reduce((s, m) => s + m.expense, 0),
    balance: stats.balance,
    budgetUtilisation: budgetRows
      .filter((b) => Number(b.amount) > 0)
      .map((b) => (spent.get(b.id) ?? 0) / Number(b.amount)),
  });

  const byCategory = (rows: unknown) =>
    ((rows ?? []) as CategoryTotal[]).map((row) => ({
      categoryName: row.category_name,
      total: roundCurrency(Number(row.total)),
      count: Number(row.txn_count),
    }));

  return {
    period: { year, month, start, end },
    transactionCount: countResult.count ?? 0,
    totals: {
      income: roundCurrency(income),
      expense: roundCurrency(expense),
      net: roundCurrency(income - expense),
      savingsRate: income > 0 ? (income - expense) / income : null,
      closingBalance: stats.balance,
    },
    previous: previous
      ? {
          income: previous.income,
          expense: previous.expense,
          net: roundCurrency(previous.income - previous.expense),
        }
      : null,
    expenseByCategory: byCategory(expenseTotals),
    incomeByCategory: byCategory(incomeTotals),
    topExpenses: (
      (topExpenses ?? []) as unknown as Array<{
        id: string;
        title: string;
        amount: number;
        transaction_date: string;
        categories: { name: string } | null;
      }>
    ).map((row) => ({
      id: row.id,
      title: row.title,
      amount: Number(row.amount),
      categoryName: row.categories?.name ?? "Uncategorised",
      transactionDate: row.transaction_date,
    })),
    budgets: budgetRows.map((b) => {
      const limit = Number(b.amount);
      const used = spent.get(b.id) ?? 0;
      return { id: b.id, name: b.name, limit, spent: used, pct: limit > 0 ? (used / limit) * 100 : 0 };
    }),
    goals: (
      (goals ?? []) as Array<{
        id: string;
        name: string;
        target_amount: number;
        saved_amount: number;
        target_date: string | null;
      }>
    ).map((g) => ({
      id: g.id,
      name: g.name,
      targetAmount: Number(g.target_amount),
      savedAmount: Number(g.saved_amount),
      targetDate: g.target_date,
    })),
    health,
    generatedAt: now,
  };
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireUser();
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const fallback = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const match = MONTH_RE.exec(searchParams.get("month") ?? "");
    const year = match ? Number(match[1]) : fallback.getFullYear();
    const month = match ? Number(match[2]) : fallback.getMonth() + 1;

    if (new Date(year, month - 1, 1) > now) {
      return jsonError("That month hasn't started yet", 422);
    }

    const payload = await cached(userId, "report", { year, month }, () =>
      buildReport(supabase, year, month, now),
    );
    return Response.json(payload);
  } catch (error) {
    return handleRouteError(error, "Failed to build the report");
  }
}
