"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatPercent, MONTH_NAMES } from "@/lib/format";
import type { HealthScore } from "@/lib/health-score";
import { useQuery } from "@/lib/use-query";
import { HealthBandBadge, PillarList, ScoreRing } from "@/components/health/health-score-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ReportPayload {
  period: { year: number; month: number; start: string; end: string };
  transactionCount: number;
  totals: {
    income: number;
    expense: number;
    net: number;
    savingsRate: number | null;
    closingBalance: number;
  };
  previous: { income: number; expense: number; net: number } | null;
  expenseByCategory: Array<{ categoryName: string; total: number; count: number }>;
  incomeByCategory: Array<{ categoryName: string; total: number; count: number }>;
  topExpenses: Array<{ id: string; title: string; amount: number; categoryName: string; transactionDate: string }>;
  budgets: Array<{ id: string; name: string; limit: number; spent: number; pct: number }>;
  goals: Array<{ id: string; name: string; targetAmount: number; savedAmount: number; targetDate: string | null }>;
  health: HealthScore;
  generatedAt: string;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shift(key: string, by: number) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y!, m! - 1 + by, 1);
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}

function Delta({ now, before, invert = false }: { now: number; before: number | undefined; invert?: boolean }) {
  if (before === undefined || before === 0) return null;
  const pct = ((now - before) / Math.abs(before)) * 100;
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <span className={cn("text-xs", good ? "text-success" : "text-destructive")}>
      {pct >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(pct), 0)} vs last month
    </span>
  );
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("min-w-0 p-6 print:p-4", className)}>
      <h2 className="overline mb-4">{title}</h2>
      {children}
    </Card>
  );
}

function Report({ data }: { data: ReportPayload }) {
  const { totals, previous } = data;
  const monthName = `${MONTH_NAMES[data.period.month - 1]} ${data.period.year}`;
  const partial = new Date(data.period.end).getTime() > new Date(data.generatedAt).getTime();
  const largest = data.expenseByCategory[0]?.total ?? 0;

  return (
    <article className="space-y-4 print:space-y-3" aria-label={`Report for ${monthName}`}>
      {/* Masthead — the only place the period is stated, so it prints first. */}
      <Card className="p-6 print:p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="overline">Fee-Nance monthly report</p>
            <h2 className="mt-1 font-display text-3xl sm:text-4xl">{monthName}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.transactionCount} transactions
              {partial ? " · month to date" : ""} · generated {formatDate(data.generatedAt)}
            </p>
          </div>
          <div className="text-right">
            <p className="overline">Closing balance</p>
            <p
              className={cn(
                "tabular font-display text-3xl normal-case tracking-normal",
                totals.closingBalance < 0 && "text-destructive",
              )}
            >
              {formatCurrency(totals.closingBalance, { whole: true })}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3 print:grid-cols-3">
        <Section title="Income">
          <p className="tabular font-display text-2xl normal-case tracking-normal text-income">
            {formatCurrency(totals.income, { whole: true })}
          </p>
          <Delta now={totals.income} before={previous?.income} />
        </Section>
        <Section title="Spending">
          <p className="tabular font-display text-2xl normal-case tracking-normal text-expense">
            {formatCurrency(totals.expense, { whole: true })}
          </p>
          <Delta now={totals.expense} before={previous?.expense} invert />
        </Section>
        <Section title="Kept">
          <p
            className={cn(
              "tabular font-display text-2xl normal-case tracking-normal",
              totals.net >= 0 ? "text-success" : "text-destructive",
            )}
          >
            {formatCurrency(totals.net, { whole: true })}
          </p>
          <span className="text-xs text-muted-foreground">
            {totals.savingsRate === null
              ? "No income this month"
              : `${formatPercent(totals.savingsRate * 100, 0)} of income`}
          </span>
        </Section>
      </div>

      <Section title="Financial health at month end">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start print:flex-row">
          <div className="flex flex-col items-center gap-2">
            <ScoreRing score={data.health.overall} band={data.health.band} size={120} />
            <HealthBandBadge band={data.health.band} />
          </div>
          <PillarList health={data.health} />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
        <Section title="Where it went">
          {data.expenseByCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spending recorded.</p>
          ) : (
            <ul className="space-y-3">
              {data.expenseByCategory.map((row) => (
                <li key={row.categoryName} className="space-y-1">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="truncate">
                      {row.categoryName}
                      <span className="ml-1.5 text-xs text-muted-foreground">×{row.count}</span>
                    </span>
                    <span className="tabular shrink-0">
                      {formatCurrency(row.total, { whole: true })}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {totals.expense > 0 ? formatPercent((row.total / totals.expense) * 100, 0) : ""}
                      </span>
                    </span>
                  </div>
                  <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-chart-3" style={{ width: `${(row.total / largest) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Largest expenses">
          {data.topExpenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spending recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Expense</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topExpenses.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="block max-w-[14rem] truncate font-medium">{row.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.categoryName} · {formatDate(row.transactionDate, "short")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.amount, { whole: true })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </div>

      {(data.budgets.length > 0 || data.goals.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
          {data.budgets.length > 0 && (
            <Section title="Budgets">
              <ul className="space-y-3">
                {data.budgets.map((budget) => (
                  <li key={budget.id} className="space-y-1">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="truncate">{budget.name}</span>
                      <span className={cn("tabular shrink-0", budget.pct > 100 && "text-destructive")}>
                        {formatCurrency(budget.spent, { whole: true })} / {formatCurrency(budget.limit, { whole: true })}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(100, budget.pct)}
                      indicatorClassName={budget.pct > 100 ? "bg-destructive" : budget.pct >= 80 ? "bg-warning" : "bg-success"}
                      aria-label={`${budget.name}: ${Math.round(budget.pct)}% used`}
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {data.goals.length > 0 && (
            <Section title="Goals (as of today)">
              <ul className="space-y-3">
                {data.goals.map((goal) => {
                  const pct = goal.targetAmount > 0 ? (goal.savedAmount / goal.targetAmount) * 100 : 0;
                  return (
                    <li key={goal.id} className="space-y-1">
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="truncate">{goal.name}</span>
                        <span className="tabular shrink-0">{formatPercent(Math.min(100, pct), 0)}</span>
                      </div>
                      <Progress value={Math.min(100, pct)} aria-label={`${goal.name}: ${Math.round(pct)}% saved`} />
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
        </div>
      )}
    </article>
  );
}

export function MonthlyReport() {
  const [current] = React.useState(() => {
    const now = new Date();
    return monthKey(now.getFullYear(), now.getMonth() + 1);
  });
  // Default to the last complete month; the running one is still moving.
  const [month, setMonth] = React.useState(() => shift(current, -1));

  const { data, isLoading, error, reload } = useQuery<ReportPayload>(
    `/api/private/report?month=${month}`,
  );

  const [y, m] = month.split("-").map(Number);
  const label = `${MONTH_NAMES[m! - 1]} ${y}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth(shift(month, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-28 text-center text-sm font-medium" aria-live="polite">
            {label}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next month"
            disabled={month >= current}
            onClick={() => setMonth(shift(month, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button variant="outline" onClick={() => window.print()} disabled={!data}>
          <Printer />
          Print or save as PDF
        </Button>
      </div>

      {isLoading ? (
        <LoadingRegion label="Building report" className="space-y-4">
          <Skeleton className="h-32 rounded-3xl" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
          </div>
          <Skeleton className="h-64 rounded-3xl" />
        </LoadingRegion>
      ) : error || !data ? (
        <ErrorState title="Couldn't build the report" onRetry={reload} />
      ) : data.transactionCount === 0 && data.totals.closingBalance === 0 ? (
        <EmptyState
          title={`Nothing recorded for ${label}`}
          description="Pick another month, or add transactions and come back."
        />
      ) : (
        <Report data={data} />
      )}
    </div>
  );
}
