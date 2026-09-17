"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  ChartPie,
  MoreHorizontal,
  PiggyBank,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useQuery, readApiError } from "@/lib/use-query";
import { formatCompact, formatCurrency, formatPercent, monthLabel } from "@/lib/format";
import {
  DateRangeFilter,
  defaultRange,
  toQueryRange,
  type DateRange,
} from "@/components/shared/date-range-filter";
import { StatCard } from "@/components/shared/stat-card";
import { SectionHeader } from "@/components/layout/page-header";
import {
  ChartFrame,
  ChartLegend,
  ChartTooltip,
  axisProps,
  chartColor,
  currencyAxisProps,
  useHiddenSeries,
} from "@/components/charts/chart-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/states";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toaster";

interface DashboardSummary {
  totals: { income: number; expense: number; balance: number };
  groupCount: number;
  categoryBreakdown: Array<{
    categoryId: string | null;
    categoryName: string;
    total: number;
  }>;
  monthlyTrend: Array<{
    year: number;
    month: number;
    income: number;
    expense: number;
  }>;
}

/* ── Trend ─────────────────────────────────────────────────────────────── */

function TrendChart({ data }: { data: DashboardSummary["monthlyTrend"] }) {
  const { hidden, toggle } = useHiddenSeries();

  const chartData = React.useMemo(
    () =>
      data.map((d) => ({
        label: monthLabel(d.month, d.year),
        income: d.income,
        expense: d.expense,
      })),
    [data],
  );

  if (!chartData.length) {
    return (
      <EmptyState
        title="Nothing to plot yet"
        description="Add transactions across a couple of months and the trend will appear here."
      />
    );
  }

  const totalIncome = data.reduce((s, d) => s + d.income, 0);
  const totalExpense = data.reduce((s, d) => s + d.expense, 0);

  return (
    <div className="space-y-3">
      {/* Legend sits above the chart and doubles as a series toggle. */}
      <ChartLegend
        series={[
          { key: "income", label: "Income", color: "var(--chart-2)", value: totalIncome },
          { key: "expense", label: "Expenses", color: "var(--chart-3)", value: totalExpense },
        ]}
        hidden={hidden}
        onToggle={toggle}
      />

      <ChartFrame
        height={260}
        summary={`Monthly income and expenses across ${chartData.length} months. Total income ${formatCurrency(totalIncome)}, total expenses ${formatCurrency(totalExpense)}.`}
      >
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis {...currencyAxisProps} />
          <RechartsTooltip
            content={<ChartTooltip />}
            cursor={{ fill: "var(--muted)" }}
          />
          {!hidden.has("income") && (
            <Bar
              dataKey="income"
              name="Income"
              fill="var(--chart-2)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          )}
          {!hidden.has("expense") && (
            <Bar
              dataKey="expense"
              name="Expenses"
              fill="var(--chart-3)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          )}
        </BarChart>
      </ChartFrame>
    </div>
  );
}

/* ── Breakdown ─────────────────────────────────────────────────────────── */

function BreakdownChart({
  categories,
  totalExpense,
}: {
  categories: DashboardSummary["categoryBreakdown"];
  totalExpense: number;
}) {
  // Beyond 5 slices a donut stops being readable — roll the tail into "Other".
  const slices = React.useMemo(() => {
    const top = categories.slice(0, 5);
    const otherTotal = categories.slice(5).reduce((s, c) => s + c.total, 0);
    return otherTotal > 0
      ? [...top, { categoryId: null, categoryName: "Other", total: otherTotal }]
      : top;
  }, [categories]);

  if (!slices.length) {
    return (
      <EmptyState
        icon={ChartPie}
        title="No expenses in this period"
        description="Once you log expenses, you'll see exactly where the money went."
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
      <ChartFrame
        height={200}
        summary={`Expense breakdown across ${slices.length} categories. Largest is ${slices[0].categoryName} at ${formatCurrency(slices[0].total)}.`}
      >
        <PieChart>
          <Pie
            data={slices}
            dataKey="total"
            nameKey="categoryName"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={2}
            strokeWidth={0}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.categoryName} fill={chartColor(index)} />
            ))}
          </Pie>
          <RechartsTooltip content={<ChartTooltip hideLabel />} />
        </PieChart>
      </ChartFrame>

      {/* Ranked list carries the exact numbers so the donut never has to. */}
      <ul className="space-y-3">
        {slices.map((slice, index) => {
          const share = totalExpense > 0 ? (slice.total / totalExpense) * 100 : 0;
          return (
            <li key={`${slice.categoryId}-${slice.categoryName}`}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: chartColor(index) }}
                  />
                  <span className="truncate">{slice.categoryName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="tabular text-xs text-muted-foreground">
                    {formatPercent(share)}
                  </span>
                  <span className="tabular font-medium">
                    {formatCompact(slice.total)}
                  </span>
                </span>
              </div>
              <Progress
                value={share}
                className="mt-1.5 h-1.5"
                indicatorColor={chartColor(index)}
                aria-hidden="true"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Skeleton ──────────────────────────────────────────────────────────── */

function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading your dashboard" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </LoadingRegion>
  );
}

/* ── Main ──────────────────────────────────────────────────────────────── */

export function DashboardOverview() {
  const [range, setRange] = React.useState<DateRange>(defaultRange);
  const [running, setRunning] = React.useState(false);

  const { startDate, endDate } = toQueryRange(range);
  const { data, isLoading, error, reload } = useQuery<DashboardSummary>(
    `/api/private/dashboard/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
  );

  const handleRunRecurring = async () => {
    setRunning(true);
    const response = await fetch("/api/private/transactions/recurring/run", {
      method: "POST",
    });
    setRunning(false);

    if (!response.ok) {
      toast.error(await readApiError(response, "Couldn't generate recurring entries"));
      return;
    }
    toast.success("Recurring transactions generated");
    reload();
  };

  if (isLoading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <ErrorState
        title="Couldn't load your dashboard"
        description="The summary request didn't come back. Check your connection and try again."
        onRetry={reload}
      />
    );
  }

  const { totals, categoryBreakdown, monthlyTrend, groupCount } = data;
  const savingsRate =
    totals.income > 0 ? (totals.balance / totals.income) * 100 : null;

  return (
    <div className="space-y-6">
      {/* ── Controls ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter value={range} onChange={setRange} onRefresh={reload} />

        {/* Secondary maintenance action lives in an overflow menu, not on the
            surface competing with real content. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="More dashboard actions"
              className="text-muted-foreground"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={handleRunRecurring} disabled={running}>
              <RefreshCw className={cn(running && "animate-spin")} />
              {running ? "Generating…" : "Generate recurring entries"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Headline metrics ────────────────────────────────────────── */}
      <section
        aria-label="Summary for the selected period"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Net balance"
          value={totals.balance}
          tone={totals.balance >= 0 ? "positive" : "negative"}
          icon={Wallet}
          delta={savingsRate}
          hint="of income kept"
        />
        <StatCard
          label="Income"
          value={totals.income}
          tone="income"
          icon={ArrowDownLeft}
        />
        <StatCard
          label="Expenses"
          value={totals.expense}
          tone="expense"
          icon={ArrowUpRight}
        />
        <StatCard
          label="Active groups"
          value={groupCount}
          currency={false}
          icon={Users}
          hint={groupCount === 0 ? "None yet" : "Shared ledgers"}
        />
      </section>

      {/* ── Charts ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Income vs expenses</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <TrendChart data={monthlyTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>Where money went</CardTitle>
            <Button variant="link" size="sm" asChild className="h-auto p-0">
              <Link href="/analytics">
                Full analytics
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <BreakdownChart
              categories={categoryBreakdown}
              totalExpense={totals.expense}
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Next steps ──────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeader title="Keep going" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card interactive className="group">
            <Link
              href="/analytics"
              className="flex items-start gap-4 p-5 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <ChartPie className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-medium">
                  Deeper analytics
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  Category trends, savings trajectory and month-on-month comparisons.
                </span>
              </span>
            </Link>
          </Card>

          <Card interactive className="group">
            <Link
              href="/groups"
              className="flex items-start gap-4 p-5 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success"
              >
                <PiggyBank className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-medium">
                  {groupCount > 0 ? "Settle up" : "Split with friends"}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {groupCount > 0
                    ? `See who owes what across your ${groupCount} group${groupCount === 1 ? "" : "s"}.`
                    : "Create a group to share expenses and settle balances."}
                </span>
              </span>
            </Link>
          </Card>
        </div>
      </section>

      {savingsRate !== null && (
        <p className="text-xs text-muted-foreground">
          You kept{" "}
          <Badge variant={savingsRate >= 20 ? "success" : savingsRate >= 5 ? "warning" : "destructive"}>
            {formatPercent(savingsRate)}
          </Badge>{" "}
          of your income this period.
        </p>
      )}
    </div>
  );
}
