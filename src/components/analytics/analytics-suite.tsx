"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Layer,
  Line,
  Pie,
  PieChart,
  Rectangle,
  ReferenceLine,
  Sankey,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChartPie,
  Percent,
  PiggyBank,
  Receipt,
} from "lucide-react";

import { useQuery } from "@/lib/use-query";
import { formatCompact, formatCurrency, formatPercent, monthLabel } from "@/lib/format";
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
  chartColor,
  currencyAxisProps,
  useHiddenSeries,
} from "@/components/charts/chart-kit";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/states";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface CategoryEntry {
  categoryId: string | null;
  categoryName: string;
  total: number;
  percentage: number;
  isDeduction?: boolean;
}

interface AnalyticsPayload {
  summary: {
    grossIncome: number;
    totalDeductions: number;
    netIncome: number;
    totalExpenses: number;
    netSavings: number;
    savingsRate: number;
    expenseRatio: number;
  };
  categoryBreakdown: CategoryEntry[];
  incomeBreakdown: CategoryEntry[];
  monthlyTrend: Array<{
    year: number;
    month: number;
    income: number;
    expense: number;
    savings: number;
  }>;
  quarterlyData: Array<{
    label: string;
    income: number;
    expense: number;
    savings: number;
  }>;
}

/* ── Monthly trend ─────────────────────────────────────────────────────── */

function TrajectoryChart({ data }: { data: AnalyticsPayload["monthlyTrend"] }) {
  const { hidden, toggle } = useHiddenSeries();

  const rows = React.useMemo(
    () =>
      data.map((d) => ({
        label: monthLabel(d.month, d.year),
        income: d.income,
        expense: d.expense,
        savings: d.savings,
      })),
    [data],
  );

  if (!rows.length) {
    return (
      <EmptyState
        title="No monthly data in this range"
        description="Widen the date range, or add transactions to start building a trend."
      />
    );
  }

  return (
    <div className="space-y-3">
      <ChartLegend
        series={[
          { key: "income", label: "Income", color: "var(--chart-2)" },
          { key: "expense", label: "Expenses", color: "var(--chart-3)" },
          { key: "savings", label: "Net savings", color: "var(--chart-1)" },
        ]}
        hidden={hidden}
        onToggle={toggle}
      />

      <ChartFrame
        height={300}
        summary={`Monthly income, expenses and net savings across ${rows.length} months.`}
      >
        <ComposedChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis {...currencyAxisProps} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
          {!hidden.has("income") && (
            <Bar
              dataKey="income"
              name="Income"
              fill="var(--chart-2)"
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            />
          )}
          {!hidden.has("expense") && (
            <Bar
              dataKey="expense"
              name="Expenses"
              fill="var(--chart-3)"
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            />
          )}
          {!hidden.has("savings") && (
            <Line
              type="monotone"
              dataKey="savings"
              name="Net savings"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: "var(--chart-1)" }}
              activeDot={{ r: 5 }}
            />
          )}
        </ComposedChart>
      </ChartFrame>
    </div>
  );
}

/* ── Cumulative savings ────────────────────────────────────────────────── */

function SavingsAreaChart({ data }: { data: AnalyticsPayload["monthlyTrend"] }) {
  const rows = React.useMemo(
    () =>
      data.reduce<Array<{ label: string; cumulative: number }>>((acc, d) => {
        const previous = acc.length ? acc[acc.length - 1].cumulative : 0;
        acc.push({
          label: monthLabel(d.month, d.year),
          cumulative: previous + d.savings,
        });
        return acc;
      }, []),
    [data],
  );

  if (!rows.length) {
    return <EmptyState title="Nothing to chart yet" />;
  }

  const final = rows[rows.length - 1].cumulative;

  return (
    <ChartFrame
      height={220}
      summary={`Cumulative savings over ${rows.length} months, ending at ${formatCurrency(final)}.`}
    >
      <AreaChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="savings-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.32} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...currencyAxisProps} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <RechartsTooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="cumulative"
          name="Cumulative savings"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#savings-fill)"
        />
      </AreaChart>
    </ChartFrame>
  );
}

/* ── Category breakdown ────────────────────────────────────────────────── */

function CategoryBreakdown({
  entries,
  total,
  emptyTitle,
}: {
  entries: CategoryEntry[];
  total: number;
  emptyTitle: string;
}) {
  // Donuts stop being readable past ~5 slices; the tail becomes "Other" and
  // the full detail lives in the table below.
  const slices = React.useMemo(() => {
    const top = entries.slice(0, 5);
    const otherTotal = entries.slice(5).reduce((s, e) => s + e.total, 0);
    return otherTotal > 0
      ? [
          ...top,
          {
            categoryId: null,
            categoryName: "Other",
            total: otherTotal,
            percentage: total > 0 ? (otherTotal / total) * 100 : 0,
          },
        ]
      : top;
  }, [entries, total]);

  if (!entries.length) {
    return (
      <EmptyState
        icon={ChartPie}
        title={emptyTitle}
        description="Categorise your transactions and the breakdown will fill in here."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:items-center">
        <ChartFrame
          height={220}
          summary={`Breakdown across ${entries.length} categories. Largest is ${entries[0].categoryName} at ${formatPercent(entries[0].percentage)}.`}
        >
          <PieChart>
            <Pie
              data={slices}
              dataKey="total"
              nameKey="categoryName"
              innerRadius={62}
              outerRadius={96}
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

        <ChartLegend
          className="flex-col items-start gap-2"
          series={slices.map((slice, index) => ({
            key: slice.categoryName,
            label: slice.categoryName,
            color: chartColor(index),
            value: slice.total,
          }))}
        />
      </div>

      {/* Table alternative — a chart alone is not screen-reader friendly. */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-40 text-right">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry, index) => (
              <TableRow key={`${entry.categoryId}-${entry.categoryName}`}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: chartColor(index) }}
                    />
                    <span className="truncate">{entry.categoryName}</span>
                    {entry.isDeduction && (
                      <Badge variant="outline" className="shrink-0">
                        Deduction
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="tabular text-right font-medium">
                  {formatCurrency(entry.total)}
                </TableCell>
                <TableCell>
                  <span className="flex items-center justify-end gap-2">
                    <Progress
                      value={entry.percentage}
                      className="h-1.5 w-16"
                      indicatorColor={chartColor(index)}
                      aria-hidden="true"
                    />
                    <span className="tabular w-12 text-right text-xs text-muted-foreground">
                      {formatPercent(entry.percentage)}
                    </span>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

/* ── Quarterly ─────────────────────────────────────────────────────────── */

function QuarterlyChart({ data }: { data: AnalyticsPayload["quarterlyData"] }) {
  if (!data.length) {
    return <EmptyState title="No quarterly data in this range" />;
  }

  return (
    <div className="space-y-3">
      <ChartLegend
        series={[
          { key: "income", label: "Income", color: "var(--chart-2)" },
          { key: "expense", label: "Expenses", color: "var(--chart-3)" },
          { key: "savings", label: "Savings", color: "var(--chart-1)" },
        ]}
      />
      <ChartFrame
        height={260}
        summary={`Income, expenses and savings across ${data.length} quarters.`}
      >
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...currencyAxisProps} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey="income" name="Income" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar dataKey="expense" name="Expenses" fill="var(--chart-3)" radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar dataKey="savings" name="Savings" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ChartFrame>
    </div>
  );
}

/* ── Money flow (Sankey) ───────────────────────────────────────────────── */

interface SankeyNodeDatum {
  name: string;
  color: string;
}

function FlowNode({
  x,
  y,
  width,
  height,
  payload,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  payload: SankeyNodeDatum & { value: number };
}) {
  // Raw SVG <text> doesn't support CSS ellipsis, and node labels sit in a
  // fixed-width margin — a long custom category name would otherwise run
  // past the chart edge, so it's clipped here instead.
  const MAX_LABEL_LENGTH = 16;
  const label =
    payload.name.length > MAX_LABEL_LENGTH
      ? `${payload.name.slice(0, MAX_LABEL_LENGTH - 1)}…`
      : payload.name;

  return (
    <Layer>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={payload.color}
        fillOpacity={0.9}
        radius={2}
      />
      <text
        x={x + width + 8}
        y={y + height / 2}
        dy="0.35em"
        className="fill-foreground text-xs"
        textAnchor="start"
      >
        <title>{payload.name}</title>
        {label}
      </text>
      <text
        x={x + width + 8}
        y={y + height / 2}
        dy="1.6em"
        className="fill-muted-foreground text-2xs tabular"
        textAnchor="start"
      >
        {formatCurrency(payload.value)}
      </text>
    </Layer>
  );
}

function buildFlowData(
  incomeBreakdown: CategoryEntry[],
  categoryBreakdown: CategoryEntry[],
  netSavings: number,
) {
  const nodes: SankeyNodeDatum[] = [];
  const links: Array<{ source: number; target: number; value: number }> = [];

  const incomeSources = incomeBreakdown.filter((c) => c.total > 0);
  const expenseCategories = categoryBreakdown.filter((c) => c.total > 0);

  if (!incomeSources.length || !expenseCategories.length) return null;

  incomeSources.forEach((entry, i) => {
    nodes.push({ name: entry.categoryName, color: chartColor(i) });
  });

  const incomeHubIndex = nodes.length;
  nodes.push({ name: "Income", color: "var(--chart-2)" });

  incomeSources.forEach((entry, i) => {
    links.push({ source: i, target: incomeHubIndex, value: entry.total });
  });

  const spendingHubIndex = nodes.length;
  nodes.push({ name: "Spending", color: "var(--chart-3)" });
  links.push({
    source: incomeHubIndex,
    target: spendingHubIndex,
    value: expenseCategories.reduce((sum, c) => sum + c.total, 0),
  });

  if (netSavings > 0) {
    const savingsIndex = nodes.length;
    nodes.push({ name: "Savings", color: "var(--chart-1)" });
    links.push({ source: incomeHubIndex, target: savingsIndex, value: netSavings });
  }

  expenseCategories.forEach((entry, i) => {
    const targetIndex = nodes.length;
    nodes.push({ name: entry.categoryName, color: chartColor(i + 1) });
    links.push({ source: spendingHubIndex, target: targetIndex, value: entry.total });
  });

  return { nodes, links };
}

function MoneyFlowChart({
  incomeBreakdown,
  categoryBreakdown,
  netSavings,
}: {
  incomeBreakdown: CategoryEntry[];
  categoryBreakdown: CategoryEntry[];
  netSavings: number;
}) {
  const flowData = React.useMemo(
    () => buildFlowData(incomeBreakdown, categoryBreakdown, netSavings),
    [incomeBreakdown, categoryBreakdown, netSavings],
  );

  if (!flowData) {
    return (
      <EmptyState
        icon={ChartPie}
        title="Nothing to trace yet"
        description="Log both income and expenses in this period to see where your money comes from and where it goes."
      />
    );
  }

  return (
    <ChartFrame
      height={Math.max(320, flowData.nodes.length * 34)}
      summary="Sankey diagram tracing money from each income source, through total spending, to every expense category."
    >
      <Sankey
        data={flowData}
        node={(props: unknown) => <FlowNode {...(props as React.ComponentProps<typeof FlowNode>)} />}
        link={{ stroke: "var(--border)", strokeOpacity: 0.5 }}
        nodePadding={24}
        nodeWidth={10}
        margin={{ top: 8, right: 140, bottom: 8, left: 8 }}
      >
        <RechartsTooltip
          formatter={(value) => formatCurrency(Number(value))}
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--popover-foreground)",
          }}
        />
      </Sankey>
    </ChartFrame>
  );
}

/* ── Main ──────────────────────────────────────────────────────────────── */

export function AnalyticsSuite() {
  const [range, setRange] = React.useState<DateRange>(defaultRange);
  const { startDate, endDate } = toQueryRange(range);

  const { data, isLoading, error, reload } = useQuery<AnalyticsPayload>(
    `/api/private/analytics/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
  );

  if (isLoading) {
    return (
      <LoadingRegion label="Loading analytics" className="space-y-6">
        <Skeleton className="h-11 w-full max-w-lg" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </LoadingRegion>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Couldn't load analytics"
        description="The summary request didn't come back. Check your connection and try again."
        onRetry={reload}
      />
    );
  }

  const { summary, categoryBreakdown, incomeBreakdown, monthlyTrend, quarterlyData } =
    data;
  const hasData = summary.grossIncome > 0 || summary.totalExpenses > 0;

  if (!hasData) {
    return (
      <div className="space-y-6">
        <DateRangeFilter value={range} onChange={setRange} onRefresh={reload} />
        <EmptyState
          icon={Receipt}
          title="No activity in this period"
          description="Pick a wider date range, or add some transactions and come back — every chart here is built from your ledger."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DateRangeFilter value={range} onChange={setRange} onRefresh={reload} />

      <section
        aria-label="Analytics summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Gross income"
          value={summary.grossIncome}
          tone="income"
          icon={ArrowDownLeft}
        />
        <StatCard
          label="Total expenses"
          value={summary.totalExpenses}
          tone="expense"
          icon={ArrowUpRight}
          hint={`${formatPercent(summary.expenseRatio)} of income`}
        />
        <StatCard
          label="Net savings"
          value={summary.netSavings}
          tone={summary.netSavings >= 0 ? "positive" : "negative"}
          icon={PiggyBank}
          delta={summary.savingsRate}
        />
        <StatCard
          label="Deductions"
          value={summary.totalDeductions}
          icon={Percent}
          hint={`Net income ${formatCompact(summary.netIncome)}`}
        />
      </section>

      <Tabs defaultValue="trend">
        <TabsList>
          <TabsTrigger value="trend">Trend</TabsTrigger>
          <TabsTrigger value="flow">Flow</TabsTrigger>
          <TabsTrigger value="spending">Spending</TabsTrigger>
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="quarters">Quarters</TabsTrigger>
        </TabsList>

        <TabsContent value="trend" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Month by month</CardTitle>
              <CardDescription>
                Bars show money in and out; the line tracks what you kept.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <TrajectoryChart data={monthlyTrend} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cumulative savings</CardTitle>
              <CardDescription>
                Where your running total sits across the selected period.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <SavingsAreaChart data={monthlyTrend} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flow">
          <Card>
            <CardHeader>
              <CardTitle>Where your money comes from and where it goes</CardTitle>
              <CardDescription>
                Each income source flows in, and total spending fans back out
                to every expense category.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <MoneyFlowChart
                incomeBreakdown={incomeBreakdown}
                categoryBreakdown={categoryBreakdown}
                netSavings={summary.netSavings}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="spending">
          <Card>
            <CardHeader>
              <CardTitle>Where your money goes</CardTitle>
              <CardDescription>
                Expense categories ranked by total, with each one&rsquo;s share of spending.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <CategoryBreakdown
                entries={categoryBreakdown}
                total={summary.totalExpenses}
                emptyTitle="No categorised expenses yet"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="income">
          <Card>
            <CardHeader>
              <CardTitle>Where your money comes from</CardTitle>
              <CardDescription>
                Income sources ranked by total contribution.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <CategoryBreakdown
                entries={incomeBreakdown}
                total={summary.grossIncome}
                emptyTitle="No categorised income yet"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quarters">
          <Card>
            <CardHeader>
              <CardTitle>Quarterly comparison</CardTitle>
              <CardDescription>
                Useful for spotting seasonal swings across the year.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <QuarterlyChart data={quarterlyData} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
