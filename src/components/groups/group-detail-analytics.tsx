"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, Receipt, Users, Wallet } from "lucide-react";

import { useQuery } from "@/lib/use-query";
import { formatCurrency, formatPercent, monthLabel } from "@/lib/format";
import { StatCard } from "@/components/shared/stat-card";
import {
  ChartFrame,
  ChartLegend,
  ChartTooltip,
  axisProps,
  chartColor,
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
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/states";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface GroupAnalytics {
  groupName: string;
  memberCount: number;
  totalGroupSpend: number;
  spendByMember: Array<{
    memberId: string;
    name: string;
    paid: number;
    owed: number;
    net: number;
  }>;
  spendByMonth: Array<{
    month: string;
    total: number;
    byMember: Array<{ memberId: string; name: string; amount: number }>;
  }>;
  topExpenses: Array<{
    title: string;
    amount: number;
    splitType: string;
    date: string;
    paidBy: Array<{ name: string; amount: number }>;
  }>;
  splitTypeBreakdown: Array<{ type: string; amount: number }>;
  settlementFlow: Array<{
    fromId: string;
    fromName: string;
    toId: string;
    toName: string;
    amount: number;
  }>;
  memberNetPositions: Array<{ memberId: string; name: string; net: number }>;
  memberShareOfSpend: Array<{
    memberId: string;
    name: string;
    amount: number;
    percentage: number;
  }>;
}

const SPLIT_LABEL: Record<string, string> = {
  equal: "Equal",
  custom: "Exact amounts",
  percentage: "Percentage",
  itemized: "By item",
};

/** "2025-03" → "Mar 25" */
function labelMonthKey(key: string) {
  const [year, month] = key.split("-");
  return monthLabel(Number(month), Number(year));
}

/** Long names get elided on the category axis so ticks stay readable. */
const truncateTick = (value: string) =>
  value.length > 12 ? `${value.slice(0, 11)}…` : value;

/* ── Paid vs owed ──────────────────────────────────────────────────────── */

function PaidVsOwedChart({ data }: { data: GroupAnalytics["spendByMember"] }) {
  if (!data.length) return <EmptyState title="No member activity yet" />;

  return (
    <div className="space-y-3">
      <ChartLegend
        series={[
          { key: "paid", label: "Paid", color: "var(--chart-1)" },
          { key: "owed", label: "Owed", color: "var(--chart-3)" },
        ]}
      />
      <ChartFrame
        height={Math.max(200, data.length * 54 + 40)}
        summary={`Amount paid versus amount owed for ${data.length} members. ${data
          .map(
            (m) =>
              `${m.name} paid ${formatCurrency(m.paid)} and owes ${formatCurrency(m.owed)}`,
          )
          .join("; ")}.`}
      >
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" />
          <XAxis type="number" {...axisProps} tickFormatter={currencyAxisProps.tickFormatter} />
          <YAxis
            type="category"
            dataKey="name"
            {...axisProps}
            width={100}
            tickFormatter={truncateTick}
          />
          <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey="paid" name="Paid" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={16} />
          <Bar dataKey="owed" name="Owed" fill="var(--chart-3)" radius={[0, 4, 4, 0]} maxBarSize={16} />
        </BarChart>
      </ChartFrame>
    </div>
  );
}

/* ── Monthly timeline ──────────────────────────────────────────────────── */

function MonthlyChart({ data }: { data: GroupAnalytics["spendByMonth"] }) {
  const rows = React.useMemo(
    () => data.map((d) => ({ label: labelMonthKey(d.month), total: d.total })),
    [data],
  );

  if (!rows.length) return <EmptyState title="No expenses logged yet" />;

  return (
    <ChartFrame
      height={220}
      summary={`Group spending across ${rows.length} months, totalling ${formatCurrency(
        rows.reduce((s, r) => s + r.total, 0),
      )}.`}
    >
      <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
        <YAxis {...currencyAxisProps} />
        <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)" }} />
        <Bar
          dataKey="total"
          name="Group spend"
          fill="var(--chart-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
        />
      </BarChart>
    </ChartFrame>
  );
}

/* ── Share of spend ────────────────────────────────────────────────────── */

function ShareChart({ data }: { data: GroupAnalytics["memberShareOfSpend"] }) {
  const slices = data.filter((d) => d.amount > 0);

  if (!slices.length) return <EmptyState title="No spend to attribute yet" />;

  return (
    <div className="grid gap-6 sm:grid-cols-[200px_1fr] sm:items-center">
      <ChartFrame
        height={180}
        summary={`Share of group spend by member. ${slices
          .map((s) => `${s.name} ${formatPercent(s.percentage)}`)
          .join(", ")}.`}
      >
        <PieChart>
          <Pie
            data={slices}
            dataKey="amount"
            nameKey="name"
            innerRadius={50}
            outerRadius={78}
            paddingAngle={2}
            strokeWidth={0}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.memberId} fill={chartColor(index)} />
            ))}
          </Pie>
          <RechartsTooltip content={<ChartTooltip hideLabel />} />
        </PieChart>
      </ChartFrame>

      <ChartLegend
        className="flex-col items-start gap-2"
        series={slices.map((slice, index) => ({
          key: slice.memberId,
          label: `${slice.name} · ${formatPercent(slice.percentage)}`,
          color: chartColor(index),
          value: slice.amount,
        }))}
      />
    </div>
  );
}

/* ── Net position ──────────────────────────────────────────────────────── */

function NetPositionChart({ data }: { data: GroupAnalytics["memberNetPositions"] }) {
  const rows = data.filter((d) => Math.abs(d.net) > 0.01);

  if (!rows.length) {
    return (
      <EmptyState
        title="Everyone's square"
        description="No outstanding balances between members."
      />
    );
  }

  return (
    <ChartFrame
      height={Math.max(180, rows.length * 46 + 40)}
      summary={`Net position per member. ${rows
        .map(
          (r) =>
            `${r.name} ${r.net >= 0 ? "is owed" : "owes"} ${formatCurrency(Math.abs(r.net))}`,
        )
        .join("; ")}.`}
    >
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <XAxis
          type="number"
          {...axisProps}
          tickFormatter={currencyAxisProps.tickFormatter}
        />
        <YAxis
          type="category"
          dataKey="name"
          {...axisProps}
          width={100}
          tickFormatter={truncateTick}
        />
        <ReferenceLine x={0} stroke="var(--border)" />
        <RechartsTooltip
          content={
            <ChartTooltip
              valueFormatter={(value) =>
                `${value >= 0 ? "Is owed " : "Owes "}${formatCurrency(Math.abs(value))}`
              }
            />
          }
          cursor={{ fill: "var(--muted)" }}
        />
        <Bar dataKey="net" name="Net position" radius={4} maxBarSize={24}>
          {rows.map((entry) => (
            <Cell
              key={entry.memberId}
              fill={entry.net >= 0 ? "var(--chart-2)" : "var(--chart-4)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/* ── Main ──────────────────────────────────────────────────────────────── */

export function GroupDetailAnalytics({ groupId }: { groupId: string }) {
  const { data, isLoading, error, reload } = useQuery<GroupAnalytics>(
    `/api/private/groups/${groupId}/analytics`,
  );

  if (isLoading) {
    return (
      <LoadingRegion label="Loading group analytics" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </LoadingRegion>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Couldn't load group analytics"
        description="The request didn't come back. Try again in a moment."
        onRetry={reload}
      />
    );
  }

  if (!data.totalGroupSpend) {
    return (
      <EmptyState
        icon={Receipt}
        title="No expenses to analyse yet"
        description="Add a shared expense and the breakdowns will appear here."
      />
    );
  }

  const perHead = data.memberCount ? data.totalGroupSpend / data.memberCount : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Group total"
          value={data.totalGroupSpend}
          icon={Wallet}
          hint="All expenses logged"
        />
        <StatCard
          label="Members"
          value={data.memberCount}
          currency={false}
          icon={Users}
        />
        <StatCard
          label="Average per member"
          value={perHead}
          icon={Receipt}
          hint="If split evenly"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Paid vs owed</CardTitle>
            <CardDescription>
              What each member fronted, against what their share came to.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <PaidVsOwedChart data={data.spendByMember} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Net position</CardTitle>
            <CardDescription>
              Right of zero means the group owes them; left means they owe the group.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <NetPositionChart data={data.memberNetPositions} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spending over time</CardTitle>
            <CardDescription>Group expenses month by month.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <MonthlyChart data={data.spendByMonth} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Share of spend</CardTitle>
            <CardDescription>
              How the total splits across members by their assigned share.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ShareChart data={data.memberShareOfSpend} />
          </CardContent>
        </Card>
      </div>

      {/* ── Top expenses ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Biggest expenses</CardTitle>
          <CardDescription>
            The largest costs logged in this group so far.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pt-0 sm:px-0">
          {data.topExpenses.length ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5 sm:pl-6">Expense</TableHead>
                  <TableHead>Paid by</TableHead>
                  <TableHead className="w-32">Split</TableHead>
                  <TableHead className="w-32 pr-5 text-right sm:pr-6">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topExpenses.map((expense, index) => (
                  <TableRow key={`${expense.title}-${expense.date}-${index}`}>
                    <TableCell className="pl-5 sm:pl-6">
                      <p className="font-medium">{expense.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {expense.date}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {expense.paidBy.length === 1 ? (
                        expense.paidBy[0].name
                      ) : (
                        <span className="flex flex-wrap items-center gap-1">
                          {expense.paidBy.map((payer) => (
                            <Badge key={payer.name} variant="outline">
                              {payer.name} {formatCurrency(payer.amount, { whole: true })}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {SPLIT_LABEL[expense.splitType] ?? expense.splitType}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular pr-5 text-right font-medium sm:pr-6">
                      {formatCurrency(expense.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="px-5 pb-5 sm:px-6">
              <EmptyState title="No expenses recorded yet" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Settlement flow ─────────────────────────────────────────── */}
      {data.settlementFlow.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Settlement history</CardTitle>
            <CardDescription>
              Money that has actually moved between members.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {data.settlementFlow.map((flow, index) => (
                <li
                  key={`${flow.fromId}-${flow.toId}-${index}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate font-medium">{flow.fromName}</span>
                    <ArrowRight
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-label="paid"
                    />
                    <span className="truncate font-medium">{flow.toName}</span>
                  </span>
                  <span className="tabular shrink-0 font-semibold text-success">
                    {formatCurrency(flow.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── Split methods ───────────────────────────────────────────── */}
      {data.splitTypeBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Split methods used</CardTitle>
            <CardDescription>How this group tends to divide its costs.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="flex flex-wrap gap-2">
              {data.splitTypeBreakdown.map((entry) => (
                <li key={entry.type}>
                  <Badge variant="outline" className="gap-1.5 px-3 py-1.5">
                    {SPLIT_LABEL[entry.type] ?? entry.type}
                    <span className="tabular font-semibold text-foreground">
                      {formatCurrency(entry.amount)}
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
