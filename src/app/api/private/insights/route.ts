/**
 * Diagnostic and forward-looking insights over the personal ledger.
 *
 * Read-only: every pipeline here is an aggregation, nothing is written and no
 * collection is created. Flags are recomputed on each request rather than
 * stored, so an edited or deleted transaction can never leave a stale flag
 * behind.
 *
 * The three diagnostics are Postgres window functions (insights_outliers,
 * insights_duplicates, insights_drift in supabase/migrations), ported from
 * the original MongoDB $setWindowFields pipelines with the same windows and
 * thresholds. They run as the caller, so row-level security applies.
 */

import { requireUser } from "@/lib/api-auth";
import { cached } from "@/lib/cache";
import { buildForecast, standardDeviation, type ForecastRule } from "@/lib/forecast";
import { toDateInput } from "@/lib/format";
import { parseDate } from "@/lib/http";
import { roundCurrency } from "@/lib/money";
import { handleRouteError, must } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

const DAY_MS = 86_400_000;

/** Horizon for the projection. Independent of the selected date range — the
 *  range filters the diagnostics, the forecast always looks forward. */
const FORECAST_DAYS = 90;

/** Trailing window the discretionary spend rate is measured over. */
const BASELINE_DAYS = 90;

/** A category needs this many prior transactions before it can flag an
 *  outlier. Below it, "unusual" is indistinguishable from "second entry". */
const MIN_PRIOR_OBSERVATIONS = 5;

/** Standard deviations above the trailing mean to count as an outlier. */
const OUTLIER_Z_THRESHOLD = 2.5;

/** Absolute floor, in rupees. Without it a ₹40 chai against a ₹12 baseline is
 *  statistically extreme and practically meaningless. */
const OUTLIER_AMOUNT_FLOOR = 500;

/** Two identical charges closer together than this look like a double-charge. */
const DUPLICATE_WINDOW_HOURS = 48;

/** Average days per period, for converting a recurring rule into a daily rate. */
const PERIOD_DAYS: Record<"monthly" | "yearly", number> = {
  monthly: 30.44,
  yearly: 365.25,
};

interface OutlierRpcRow {
  id: string;
  title: string;
  amount: number;
  category_id: string | null;
  category_name: string;
  transaction_date: string;
  baseline: number;
  z_score: number;
}

interface DuplicateRpcRow {
  id: string;
  previous_id: string;
  title: string;
  amount: number;
  category_id: string | null;
  category_name: string;
  transaction_date: string;
  previous_date: string;
  gap_hours: number;
}

interface DriftRpcRow {
  category_id: string | null;
  category_name: string;
  year: number;
  month: number;
  total: number;
  trailing_avg: number;
  delta_pct: number;
}

type TypeTotal = { type: string; total: number };
type MonthTotal = { year: number; month: number; income: number; expense: number };
type RuleRow = {
  title: string;
  type: "income" | "expense";
  amount: number;
  recurring_frequency: "monthly" | "yearly";
  recurring_next_run_at: string;
};

async function buildInsights(supabase: SupabaseServerClient, startDate: Date, endDate: Date) {
  const baselineStart = new Date(endDate.getTime() - BASELINE_DAYS * DAY_MS);
  const range = { p_start: startDate.toISOString(), p_end: endDate.toISOString() };

  const [outliers, duplicates, driftResult, balanceTotals, monthly, daily, baselineTotals, ruleRows] =
    await Promise.all([
      supabase
        .rpc("insights_outliers", {
          ...range,
          p_min_prior: MIN_PRIOR_OBSERVATIONS,
          p_z_threshold: OUTLIER_Z_THRESHOLD,
          p_amount_floor: OUTLIER_AMOUNT_FLOOR,
        })
        .then(must),
      supabase.rpc("insights_duplicates", { ...range, p_window_hours: DUPLICATE_WINDOW_HOURS }).then(must),
      supabase.rpc("insights_drift", range).then(must),
      // Balance as of the end of the range — the projection's starting point.
      supabase.rpc("ledger_type_totals", { p_start: null, p_end: range.p_end }).then(must),
      // Monthly net across the range — supplies the spread for the band.
      supabase.rpc("ledger_monthly_totals", range).then(must),
      // Daily net over the baseline window — the actual half of the chart.
      supabase.rpc("ledger_daily_net", { p_start: baselineStart.toISOString(), p_end: range.p_end }).then(must),
      // Trailing expense total — the raw discretionary rate.
      supabase.rpc("ledger_type_totals", { p_start: baselineStart.toISOString(), p_end: range.p_end }).then(must),
      // The recurring rules themselves.
      supabase
        .from("transactions")
        .select("title, type, amount, recurring_frequency, recurring_next_run_at")
        .eq("recurring_enabled", true)
        .in("recurring_frequency", ["monthly", "yearly"])
        .not("recurring_next_run_at", "is", null)
        .then(must),
    ]);

  // Normalise to the shapes the forecast code below works with.
  const outlierRows = ((outliers ?? []) as OutlierRpcRow[]).map((row) => ({
    _id: row.id,
    title: row.title,
    amount: Number(row.amount),
    categoryId: row.category_id,
    categoryName: row.category_name,
    transactionDate: row.transaction_date,
    baseline: Number(row.baseline),
    zScore: Number(row.z_score),
  }));
  const duplicateRows = ((duplicates ?? []) as DuplicateRpcRow[]).map((row) => ({
    _id: row.id,
    prevId: row.previous_id,
    title: row.title,
    amount: Number(row.amount),
    categoryName: row.category_name,
    transactionDate: row.transaction_date,
    prevDate: row.previous_date,
    gapHours: row.gap_hours,
  }));
  const driftRows = ((driftResult ?? []) as DriftRpcRow[]).map((row) => ({
    _id: { categoryId: row.category_id, year: row.year, month: row.month },
    categoryName: row.category_name,
    total: Number(row.total),
    trailingAvg: Number(row.trailing_avg),
    deltaPct: Number(row.delta_pct),
  }));
  const balanceRows = ((balanceTotals ?? []) as TypeTotal[]).map((row) => ({
    _id: row.type,
    total: Number(row.total),
  }));
  const monthlyNetRows = ((monthly ?? []) as MonthTotal[]).map((row) => ({
    income: Number(row.income),
    expense: Number(row.expense),
  }));
  const dailyNetRows = ((daily ?? []) as Array<{ day: string; net: number }>).map((row) => ({
    _id: row.day,
    net: Number(row.net),
  }));
  const baselineRows = [
    { total: Number(((baselineTotals ?? []) as TypeTotal[]).find((t) => t.type === "expense")?.total ?? 0) },
  ];
  const recurringRules = ((ruleRows ?? []) as RuleRow[]).map((rule) => ({
    title: rule.title,
    type: rule.type,
    amount: Number(rule.amount),
    recurring: { frequency: rule.recurring_frequency, nextRunAt: rule.recurring_next_run_at },
  }));

  /* ── Forecast inputs ────────────────────────────────────────────────── */

  const income = balanceRows.find((row) => row._id === "income")?.total ?? 0;
  const expense = balanceRows.find((row) => row._id === "expense")?.total ?? 0;
  const balance = roundCurrency(income - expense);

  const rules: ForecastRule[] = recurringRules
    .filter((rule) => rule.recurring?.nextRunAt)
    .map((rule) => ({
      title: rule.title as string,
      type: rule.type as "income" | "expense",
      amount: rule.amount as number,
      frequency: rule.recurring.frequency as "monthly" | "yearly",
      nextRunAt: new Date(rule.recurring.nextRunAt),
    }));

  /* Recurring expenses appear twice: once as the rule the forecast projects
     forward, and again inside the trailing spend total as the occurrences
     the runner already generated. Generated occurrences carry no link back
     to their source (see backlog F8), so they can't be filtered out by id —
     instead subtract each rule's *rate*, which nets the double count out
     exactly over a long enough window. */
  const committedDailyExpense = rules
    .filter((rule) => rule.type === "expense")
    .reduce(
      (sum, rule) => sum + rule.amount / PERIOD_DAYS[rule.frequency],
      0,
    );

  const outlierTotalInWindow = outlierRows
    .filter((row) => new Date(row.transactionDate).getTime() >= baselineStart.getTime())
    .reduce((sum, row) => sum + row.amount, 0);

  const baselineExpense = baselineRows[0]?.total ?? 0;
  const dailyDiscretionarySpend = Math.max(
    0,
    roundCurrency(
      (baselineExpense - outlierTotalInWindow) / BASELINE_DAYS -
        committedDailyExpense,
    ),
  );

  const monthlyNets = monthlyNetRows.map((row) => row.income - row.expense);

  const forecast = buildForecast({
    openingBalance: balance,
    asOf: endDate,
    horizonDays: FORECAST_DAYS,
    rules,
    dailyDiscretionarySpend,
    monthlyNetStdDev: standardDeviation(monthlyNets),
  });

  /* ── Actual balance series ──────────────────────────────────────────── */

  // Walk forward from the balance at the start of the baseline window so the
  // actual line meets the projection at today's value rather than jumping.
  const windowNet = dailyNetRows.reduce((sum, row) => sum + row.net, 0);
  let running = roundCurrency(balance - windowNet);

  const netByDay = new Map<string, number>(
    dailyNetRows.map((row) => [row._id as string, row.net as number]),
  );

  const actualSeries: Array<{ date: string; actual: number }> = [];
  for (let offset = 0; offset <= BASELINE_DAYS; offset += 1) {
    const date = toDateInput(new Date(baselineStart.getTime() + offset * DAY_MS));
    running = roundCurrency(running + (netByDay.get(date) ?? 0));
    actualSeries.push({ date, actual: running });
  }

  // One array for the chart. `actual` stops at today, `projected` starts
  // there — recharts renders the gap as two segments of the same line.
  const balanceSeries = [
    ...actualSeries.map((point) => ({
      date: point.date,
      actual: point.actual,
      projected: null as number | null,
      lower: null as number | null,
      upper: null as number | null,
    })),
    ...forecast.points.map((point) => ({
      date: point.date,
      actual: null as number | null,
      projected: point.projected,
      lower: point.lower,
      upper: point.upper,
    })),
  ];

  // Join the two halves so the line is continuous.
  const lastActual = actualSeries.at(-1);
  if (lastActual) {
    const seam = balanceSeries.find((point) => point.date === lastActual.date);
    if (seam) {
      seam.projected = lastActual.actual;
      seam.lower = lastActual.actual;
      seam.upper = lastActual.actual;
    }
  }

  /* ── Drift: latest month per category, largest movements first ───────── */

  const seenCategories = new Set<string>();
  const drift = driftRows
    .filter((row) => {
      const key = row._id.categoryId?.toString?.() ?? "none";
      if (seenCategories.has(key)) return false;
      seenCategories.add(key);
      return true;
    })
    .map((row) => ({
      categoryId: row._id.categoryId?.toString?.() ?? null,
      categoryName: row.categoryName,
      year: row._id.year,
      month: row._id.month,
      total: roundCurrency(row.total),
      trailingAvg: roundCurrency(row.trailingAvg),
      deltaPct: row.deltaPct,
    }))
    .filter((row) => Math.abs(row.deltaPct) >= 15)
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
    .slice(0, 8);

  return {
    dateRange: { startDate, endDate },
    summary: {
      balance,
      net30: forecast.net30,
      closingBalance: forecast.closingBalance,
      shortfallDate: forecast.shortfallDate,
      anomalyCount: outlierRows.length,
      duplicateCount: duplicateRows.length,
      dailyDiscretionarySpend,
      committedIncome: forecast.committedIncome,
      committedExpense: forecast.committedExpense,
      discretionaryExpense: forecast.discretionaryExpense,
      recurringRuleCount: rules.length,
      forecastDays: FORECAST_DAYS,
    },
    balanceSeries,
    anomalies: outlierRows.map((row) => ({
      id: row._id?.toString?.() ?? "",
      title: row.title,
      categoryName: row.categoryName,
      amount: roundCurrency(row.amount),
      baseline: roundCurrency(row.baseline),
      // "3.2× your usual Food spend" reads better than a z-score, but keep
      // both — the multiple for humans, the score for ordering.
      multiple: row.baseline > 0 ? row.amount / row.baseline : null,
      zScore: row.zScore,
      transactionDate: row.transactionDate,
    })),
    duplicates: duplicateRows.map((row) => ({
      id: row._id?.toString?.() ?? "",
      previousId: row.prevId?.toString?.() ?? "",
      title: row.title,
      categoryName: row.categoryName,
      amount: roundCurrency(row.amount),
      transactionDate: row.transactionDate,
      previousDate: row.prevDate,
      gapHours: row.gapHours,
    })),
    drift,
  };
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireUser();
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setMonth(defaultStart.getMonth() - 11);
    defaultStart.setDate(1);
    defaultStart.setHours(0, 0, 0, 0);

    const startDate = parseDate(searchParams.get("startDate"), defaultStart) as Date;
    const endDate = parseDate(searchParams.get("endDate"), now) as Date;

    const payload = await cached(
      userId,
      "insights",
      { start: startDate.toISOString(), end: endDate.toISOString() },
      () => buildInsights(supabase, startDate, endDate),
    );
    return Response.json(payload);
  } catch (error) {
    return handleRouteError(error, "Failed to load insights");
  }
}
