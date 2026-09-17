/**
 * Diagnostic and forward-looking insights over the personal ledger.
 *
 * Read-only: every pipeline here is an aggregation, nothing is written and no
 * collection is created. Flags are recomputed on each request rather than
 * stored, so an edited or deleted transaction can never leave a stale flag
 * behind.
 *
 * Three of the pipelines use `$setWindowFields` (MongoDB 5.0+). The remaining
 * ones are ordinary `$group`s. See `docs/insights-pipelines.md` for the index
 * each one rides and the captured explain output.
 */

import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { buildForecast, standardDeviation, type ForecastRule } from "@/lib/forecast";
import { toDateInput } from "@/lib/format";
import { parseDate, jsonError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { roundCurrency } from "@/lib/money";
import { toObjectId } from "@/lib/object-id";
import { Category } from "@/models/Category";
import { Transaction } from "@/models/Transaction";

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

interface OutlierRow {
  _id: unknown;
  title: string;
  amount: number;
  categoryId: unknown;
  transactionDate: Date;
  baseline: number;
  zScore: number;
}

interface DuplicateRow {
  _id: unknown;
  prevId: unknown;
  title: string;
  amount: number;
  categoryId: unknown;
  transactionDate: Date;
  prevDate: Date;
  gapHours: number;
}

interface DriftRow {
  _id: { categoryId: unknown; year: number; month: number };
  total: number;
  trailingAvg: number;
  deltaPct: number;
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    await connectToDatabase();

    const userObjectId = toObjectId(userId);
    const { searchParams } = new URL(request.url);

    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setMonth(defaultStart.getMonth() - 11);
    defaultStart.setDate(1);
    defaultStart.setHours(0, 0, 0, 0);

    const startDate = parseDate(searchParams.get("startDate"), defaultStart) as Date;
    const endDate = parseDate(searchParams.get("endDate"), now) as Date;
    const baselineStart = new Date(endDate.getTime() - BASELINE_DAYS * DAY_MS);

    const rangeMatch = {
      userId: userObjectId,
      transactionDate: { $gte: startDate, $lte: endDate },
    };

    const [
      outlierRows,
      duplicateRows,
      driftRows,
      balanceRows,
      monthlyNetRows,
      dailyNetRows,
      baselineRows,
      recurringRules,
    ] = await Promise.all([
      /* 1. Outliers — how each expense compares to the trailing behaviour of
            its own category. The window is [-11, -1]: strictly *prior*
            transactions, so a spike can never inflate the baseline it is
            judged against. Rides {userId, categoryId, transactionDate}. */
      Transaction.aggregate<OutlierRow>([
        { $match: { ...rangeMatch, type: "expense" } },
        {
          $setWindowFields: {
            partitionBy: "$categoryId",
            sortBy: { transactionDate: 1 },
            output: {
              baseline: { $avg: "$amount", window: { documents: [-11, -1] } },
              spread: { $stdDevSamp: "$amount", window: { documents: [-11, -1] } },
              priorSeen: { $count: {}, window: { documents: [-11, -1] } },
            },
          },
        },
        { $match: { priorSeen: { $gte: MIN_PRIOR_OBSERVATIONS } } },
        {
          $set: {
            // A zero or null spread means a category with no variation at all;
            // treat it as unremarkable rather than dividing by zero.
            zScore: {
              $cond: [
                { $gt: ["$spread", 0] },
                {
                  $divide: [{ $subtract: ["$amount", "$baseline"] }, "$spread"],
                },
                0,
              ],
            },
          },
        },
        {
          $match: {
            zScore: { $gte: OUTLIER_Z_THRESHOLD },
            amount: { $gte: OUTLIER_AMOUNT_FLOOR },
          },
        },
        { $sort: { zScore: -1 } },
        { $limit: 20 },
        {
          $project: {
            title: 1,
            amount: 1,
            categoryId: 1,
            transactionDate: 1,
            baseline: 1,
            zScore: 1,
          },
        },
      ]),

      /* 2. Duplicate charges — the same amount and title landing twice inside
            48 hours. `$shift` reaches back one document within the partition,
            which is the whole comparison. */
      Transaction.aggregate<DuplicateRow>([
        { $match: { ...rangeMatch, type: "expense" } },
        {
          $set: {
            dupKey: {
              amount: "$amount",
              title: { $toLower: { $trim: { input: "$title" } } },
            },
          },
        },
        {
          $setWindowFields: {
            partitionBy: "$dupKey",
            sortBy: { transactionDate: 1 },
            output: {
              prevDate: {
                $shift: { output: "$transactionDate", by: -1, default: null },
              },
              prevId: { $shift: { output: "$_id", by: -1, default: null } },
            },
          },
        },
        { $match: { prevDate: { $ne: null } } },
        {
          $set: {
            gapHours: {
              $dateDiff: {
                startDate: "$prevDate",
                endDate: "$transactionDate",
                unit: "hour",
              },
            },
          },
        },
        { $match: { gapHours: { $lte: DUPLICATE_WINDOW_HOURS } } },
        { $sort: { transactionDate: -1 } },
        { $limit: 20 },
        {
          $project: {
            title: 1,
            amount: 1,
            categoryId: 1,
            transactionDate: 1,
            prevDate: 1,
            prevId: 1,
            gapHours: 1,
          },
        },
      ]),

      /* 3. Category drift — this month against the trailing three months of
            the same category. Two stages: fold to one row per category-month,
            then window over those rows. */
      Transaction.aggregate<DriftRow>([
        { $match: { ...rangeMatch, type: "expense" } },
        {
          $group: {
            _id: {
              categoryId: "$categoryId",
              year: { $year: "$transactionDate" },
              month: { $month: "$transactionDate" },
            },
            total: { $sum: "$amount" },
          },
        },
        {
          $setWindowFields: {
            partitionBy: "$_id.categoryId",
            sortBy: { "_id.year": 1, "_id.month": 1 },
            output: {
              trailingAvg: { $avg: "$total", window: { documents: [-3, -1] } },
            },
          },
        },
        { $match: { trailingAvg: { $gt: 0 } } },
        {
          $set: {
            deltaPct: {
              $multiply: [
                {
                  $divide: [
                    { $subtract: ["$total", "$trailingAvg"] },
                    "$trailingAvg",
                  ],
                },
                100,
              ],
            },
          },
        },
        { $sort: { "_id.year": -1, "_id.month": -1 } },
      ]),

      // 4. Balance as of the end of the range — the projection's starting point.
      Transaction.aggregate([
        { $match: { userId: userObjectId, transactionDate: { $lte: endDate } } },
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ]),

      // 5. Monthly net across the range — supplies the spread for the band.
      Transaction.aggregate([
        { $match: rangeMatch },
        {
          $group: {
            _id: {
              year: { $year: "$transactionDate" },
              month: { $month: "$transactionDate" },
            },
            income: {
              $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] },
            },
            expense: {
              $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] },
            },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]),

      // 6. Daily net over the baseline window — the actual half of the chart.
      Transaction.aggregate([
        {
          $match: {
            userId: userObjectId,
            transactionDate: { $gte: baselineStart, $lte: endDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$transactionDate" },
            },
            net: {
              $sum: {
                $cond: [{ $eq: ["$type", "income"] }, "$amount", { $multiply: ["$amount", -1] }],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // 7. Trailing expense total — the raw discretionary rate before netting
      //    out what the recurring rules already account for.
      Transaction.aggregate([
        {
          $match: {
            userId: userObjectId,
            type: "expense",
            transactionDate: { $gte: baselineStart, $lte: endDate },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),

      // 8. The recurring rules themselves.
      Transaction.find({
        userId: userObjectId,
        "recurring.enabled": true,
        "recurring.frequency": { $in: ["monthly", "yearly"] },
        "recurring.nextRunAt": { $ne: null },
      })
        .select("title type amount recurring")
        .lean(),
    ]);

    /* ── Resolve category names ─────────────────────────────────────────── */

    const categoryIds = [
      ...outlierRows.map((row) => row.categoryId),
      ...duplicateRows.map((row) => row.categoryId),
      ...driftRows.map((row) => row._id.categoryId),
    ].filter(Boolean);

    const categories = await Category.find({
      $or: [
        { _id: { $in: categoryIds } },
        { isSystem: true },
        { userId: userObjectId },
      ],
    })
      .select("_id name")
      .lean();

    const categoryMap = new Map(
      categories.map((category) => [category._id.toString(), category.name as string]),
    );

    const categoryName = (id: unknown) =>
      categoryMap.get(id?.toString?.() ?? "") ?? "Uncategorized";

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
        nextRunAt: new Date(rule.recurring.nextRunAt as Date),
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
        categoryName: categoryName(row._id.categoryId),
        year: row._id.year,
        month: row._id.month,
        total: roundCurrency(row.total),
        trailingAvg: roundCurrency(row.trailingAvg),
        deltaPct: row.deltaPct,
      }))
      .filter((row) => Math.abs(row.deltaPct) >= 15)
      .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
      .slice(0, 8);

    return Response.json({
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
        categoryName: categoryName(row.categoryId),
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
        categoryName: categoryName(row.categoryId),
        amount: roundCurrency(row.amount),
        transactionDate: row.transactionDate,
        previousDate: row.prevDate,
        gapHours: row.gapHours,
      })),
      drift,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    logger.error("Insights API error", error);
    return jsonError("Failed to load insights", 500);
  }
}
