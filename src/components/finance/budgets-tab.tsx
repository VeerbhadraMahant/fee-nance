"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Target, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Budget, Category, Transaction } from "./types";

/** Spend actually booked against a budget's category and period. */
export function spendFor(budget: Budget, transactions: Transaction[]) {
  const start = new Date(budget.periodStart).getTime();
  const end = new Date(budget.periodEnd).getTime();

  return transactions.reduce((total, txn) => {
    if (txn.type !== "expense") return total;
    if (budget.categoryId && txn.categoryId !== budget.categoryId) return total;
    const at = new Date(txn.transactionDate).getTime();
    if (at < start || at > end) return total;
    return total + txn.amount;
  }, 0);
}

export function BudgetsTab({
  budgets,
  categories,
  transactions,
  onCreate,
  onEdit,
  onDelete,
}: {
  budgets: Budget[];
  categories: Category[];
  transactions: Transaction[];
  onCreate: () => void;
  onEdit: (budget: Budget) => void;
  onDelete: (budget: Budget) => void;
}) {
  const categoryMap = React.useMemo(
    () => new Map(categories.map((c) => [c._id, c.name])),
    [categories],
  );

  if (!budgets.length) {
    return (
      <EmptyState
        icon={Target}
        title="No budgets in this period"
        description="Set a ceiling for a category or for your overall spending, and track how close you are as the period runs."
        action={
          <Button size="sm" onClick={onCreate}>
            Create budget
          </Button>
        }
      />
    );
  }

  return (
    <ul className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {budgets.map((budget) => {
        const spent = spendFor(budget, transactions);
        const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
        const remaining = budget.amount - spent;
        const over = remaining < 0;
        const nearLimit = !over && pct >= 80;

        return (
          <li key={budget._id}>
            <Card className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-medium">{budget.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {budget.categoryId
                      ? (categoryMap.get(budget.categoryId) ?? "Unknown category")
                      : "All categories"}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-mr-2 -mt-1 size-9 shrink-0 text-muted-foreground"
                      aria-label={`Actions for ${budget.name}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onEdit(budget)}>
                      <Pencil />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => onDelete(budget)}
                    >
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                <span className="tabular min-w-0 truncate text-xl font-semibold">
                  {formatCurrency(spent)}
                </span>
                <span className="tabular min-w-0 truncate text-sm text-muted-foreground">
                  of {formatCurrency(budget.amount)}
                </span>
              </div>

              <Progress
                value={Math.min(pct, 100)}
                className="mt-3"
                indicatorClassName={cn(
                  over
                    ? "bg-destructive"
                    : nearLimit
                      ? "bg-warning"
                      : "bg-success",
                )}
                aria-label={`${budget.name}: ${pct.toFixed(0)} percent of budget used`}
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {/* Status is a worded badge, not just a bar colour. */}
                <Badge
                  variant={
                    over ? "destructive" : nearLimit ? "warning" : "success"
                  }
                >
                  {over
                    ? `${formatCurrency(Math.abs(remaining))} over`
                    : `${formatCurrency(remaining)} left`}
                </Badge>
                <span className="tabular text-xs text-muted-foreground">
                  {pct.toFixed(0)}% used
                </span>
              </div>

              <p className="mt-auto pt-4 text-xs capitalize text-muted-foreground">
                {budget.cycle} · {formatDate(budget.periodStart, "short")} –{" "}
                {formatDate(budget.periodEnd, "short")}
              </p>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
