"use client";

import * as React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarClock,
  Copy,
  Radar,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { useQuery } from "@/lib/use-query";
import {
  formatCurrency,
  formatDate,
  formatPercent,
  monthLabel,
} from "@/lib/format";
import {
  DateRangeFilter,
  defaultRange,
  toQueryRange,
  type DateRange,
} from "@/components/shared/date-range-filter";
import { StatCard } from "@/components/shared/stat-card";
import {
  ChartFrame,
  ChartLegend,
  ChartTooltip,
  axisProps,
  currencyAxisProps,
} from "@/components/charts/chart-kit";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyState,
  ErrorState,
  LoadingRegion,
  Skeleton,
} from "@/components/ui/states";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface InsightsPayload {
  summary: {
    balance: number;
    net30: number;
    closingBalance: number;
    shortfallDate: string | null;
    anomalyCount: number;
    duplicateCount: number;
    dailyDiscretionarySpend: number;
    committedIncome: number;
    committedExpense: number;
    discretionaryExpense: number;
    recurringRuleCount: number;
    forecastDays: number;
  };
  balanceSeries: Array<{
    date: string;
    actual: number | null;
    projected: number | null;
    lower: number | null;
    upper: number | null;
  }>;
  anomalies: Array<{
    id: string;
    title: string;
    categoryName: string;
    amount: number;
    baseline: number;
    multiple: number | null;
    zScore: number;
    transactionDate: string;
  }>;
  duplicates: Array<{
    id: string;
    previousId: string;
    title: string;
    categoryName: string;
    amount: number;
    transactionDate: string;
    previousDate: string;
    gapHours: number;
  }>;
  drift: Array<{
    categoryId: string | null;
    categoryName: string;
    year: number;
    month: number;
    total: number;
    trailingAvg: number;
    deltaPct: number;
  }>;
}

/* ── Forecast chart ────────────────────────────────────────────────────── */

function ForecastChart({
  series,
  forecastDays,
}: {
  series: InsightsPayload["balanceSeries"];
  forecastDays: number;
}) {
  // The band is plotted as two stacked areas: an invisible one up to `lower`,
  // then the visible spread on top. Recharts has no native band mark.
  const rows = React.useMemo(
    () =>
      series.map((point) => ({
        ...point,
        bandBase: point.lower,
        bandSpread:
          point.upper !== null && point.lower !== null
            ? point.upper - point.lower
            : null,
      })),
    [series],
  );

  const today = series.find((point) => point.projected !== null)?.date;

  return (
    <div className="space-y-3">
      <ChartLegend
        series={[
          { key: "actual", label: "Actual balance", color: "var(--chart-1)" },
          { key: "projected", label: "Projected", color: "var(--chart-4)" },
        ]}
      />

      <ChartFrame
        height={320}
        summary={`Balance over the last 90 days and projected ${forecastDays} days forward, with a confidence band that widens with time.`}
      >
        <ComposedChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            {...axisProps}
            interval="preserveStartEnd"
            minTickGap={48}
            tickFormatter={(value: string) => formatDate(value, "short")}
          />
          <YAxis {...currencyAxisProps} />
          <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="4 4" />
          {today && (
            <ReferenceLine
              x={today}
              stroke="var(--border)"
              label={{ value: "today", position: "insideTopLeft", fontSize: 11 }}
            />
          )}
          <RechartsTooltip
            content={
              <ChartTooltip
                labelFormatter={(label) => formatDate(String(label))}
              />
            }
          />

          {/* Invisible pedestal — lifts the visible band to `lower`. */}
          <Area
            dataKey="bandBase"
            stackId="band"
            stroke="none"
            fill="transparent"
            isAnimationActive={false}
            legendType="none"
            name="band base"
          />
          <Area
            dataKey="bandSpread"
            stackId="band"
            stroke="none"
            fill="var(--chart-4)"
            fillOpacity={0.14}
            isAnimationActive={false}
            legendType="none"
            name="Range"
          />

          <Line
            dataKey="actual"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            name="Actual balance"
          />
          <Line
            dataKey="projected"
            stroke="var(--chart-4)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls={false}
            name="Projected"
          />
        </ComposedChart>
      </ChartFrame>
    </div>
  );
}

/* ── Anomalies ─────────────────────────────────────────────────────────── */

function AnomalyTable({ rows }: { rows: InsightsPayload["anomalies"] }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={Radar}
        title="Nothing unusual in this period"
        description="An expense is flagged when it sits well above the recent run of spending in its own category. A category needs about five earlier transactions before it can be judged at all."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Transaction</TableHead>
          <TableHead>Why it stands out</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <span className="block font-medium">{row.title}</span>
              <span className="block text-xs text-muted-foreground">
                {row.categoryName} · {formatDate(row.transactionDate)}
              </span>
            </TableCell>
            <TableCell>
              <span className="block text-sm">
                {row.multiple
                  ? `${row.multiple.toFixed(1)}× your usual ${row.categoryName} spend`
                  : `Well above your usual ${row.categoryName} spend`}
              </span>
              <span className="block text-xs text-muted-foreground">
                Typically around {formatCurrency(row.baseline)}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <span className="tabular font-medium">
                {formatCurrency(row.amount)}
              </span>
              <Badge variant="outline" className="ml-2 align-middle">
                {row.zScore.toFixed(1)}σ
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ── Duplicates ────────────────────────────────────────────────────────── */

function DuplicateList({ rows }: { rows: InsightsPayload["duplicates"] }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={Copy}
        title="No repeated charges found"
        description="This looks for the same amount and description recorded twice within 48 hours — the shape of a double-charge or an accidental re-entry."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{row.title}</p>
            <p className="text-xs text-muted-foreground">
              {row.categoryName} · {formatDate(row.previousDate)} and{" "}
              {formatDate(row.transactionDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {row.gapHours < 24
                ? `${row.gapHours}h apart`
                : `${Math.round(row.gapHours / 24)}d apart`}
            </Badge>
            <span className="tabular font-medium">
              {formatCurrency(row.amount)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Category drift ────────────────────────────────────────────────────── */

function DriftList({ rows }: { rows: InsightsPayload["drift"] }) {
  if (!rows.length) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Spending is steady"
        description="No category moved more than 15% against its own three-month average in this period."
      />
    );
  }

  const widest = Math.max(...rows.map((row) => Math.abs(row.deltaPct)), 1);

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const up = row.deltaPct >= 0;
        const Icon = up ? TrendingUp : TrendingDown;

        return (
          <li key={row.categoryId ?? row.categoryName} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon
                  className={up ? "size-3.5 text-expense" : "size-3.5 text-success"}
                  aria-hidden="true"
                />
                <span className="truncate font-medium">{row.categoryName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {monthLabel(row.month, row.year)}
                </span>
              </span>
              <span
                className={
                  up
                    ? "tabular shrink-0 font-medium text-expense"
                    : "tabular shrink-0 font-medium text-success"
                }
              >
                {up ? "+" : ""}
                {formatPercent(row.deltaPct, 0)}
              </span>
            </div>

            <div
              aria-hidden="true"
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={up ? "h-full bg-expense" : "h-full bg-success"}
                style={{ width: `${(Math.abs(row.deltaPct) / widest) * 100}%` }}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {formatCurrency(row.total)} this month against a{" "}
              {formatCurrency(row.trailingAvg)} average
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Main ──────────────────────────────────────────────────────────────── */

export function InsightsSuite() {
  const [range, setRange] = React.useState<DateRange>(defaultRange);
  const { startDate, endDate } = toQueryRange(range);

  const { data, isLoading, error, reload } = useQuery<InsightsPayload>(
    `/api/private/insights?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
  );

  if (isLoading) {
    return (
      <LoadingRegion label="Loading insights" className="space-y-6">
        <Skeleton className="h-11 w-full max-w-lg" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </LoadingRegion>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Couldn't load insights"
        description="The insights request didn't come back. Check your connection and try again."
        onRetry={reload}
      />
    );
  }

  const { summary, balanceSeries, anomalies, duplicates, drift } = data;

  return (
    <div className="space-y-6">
      <DateRangeFilter value={range} onChange={setRange} onRefresh={reload} />

      <section
        aria-label="Forecast summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Balance today"
          value={summary.balance}
          icon={Wallet}
          tone={summary.balance >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label="Projected 30-day net"
          value={summary.net30}
          icon={summary.net30 >= 0 ? TrendingUp : TrendingDown}
          tone={summary.net30 >= 0 ? "positive" : "negative"}
          hint={`${summary.recurringRuleCount} recurring rule${summary.recurringRuleCount === 1 ? "" : "s"}`}
        />
        <StatCard
          label={`Projected in ${summary.forecastDays} days`}
          value={summary.closingBalance}
          icon={CalendarClock}
          tone={summary.closingBalance >= 0 ? "positive" : "negative"}
          hint={
            summary.shortfallDate
              ? `Runs out ${formatDate(summary.shortfallDate)}`
              : "Stays positive"
          }
        />
        <StatCard
          label="Flags raised"
          value={`${summary.anomalyCount + summary.duplicateCount}`}
          currency={false}
          icon={Radar}
          tone={summary.anomalyCount + summary.duplicateCount > 0 ? "expense" : "neutral"}
          hint={`${summary.anomalyCount} unusual · ${summary.duplicateCount} repeated`}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Where your balance is heading</CardTitle>
          <CardDescription>
            Recurring income and bills are projected forward from their schedules;
            everyday spending continues at{" "}
            {formatCurrency(summary.dailyDiscretionarySpend)} a day, the recent
            average with one-offs removed. The band widens further out because
            uncertainty compounds.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ForecastChart
            series={balanceSeries}
            forecastDays={summary.forecastDays}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unusual spending</CardTitle>
          <CardDescription>
            Each expense is compared against the eleven before it in the same
            category, so a big grocery run is judged against groceries and not
            against rent.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <AnomalyTable rows={anomalies} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Possible repeats</CardTitle>
            <CardDescription>
              The same charge recorded twice in quick succession.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <DuplicateList rows={duplicates} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What changed</CardTitle>
            <CardDescription>
              Categories moving against their own three-month average.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <DriftList rows={drift} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
