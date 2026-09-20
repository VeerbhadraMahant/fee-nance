"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, Download, Plus, Wallet } from "lucide-react";

import { useQuery, readApiError } from "@/lib/use-query";
import { downloadCsv } from "@/lib/csv";
import { toQueryRange, defaultRange, DateRangeFilter, type DateRange } from "@/components/shared/date-range-filter";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Skeleton, ErrorState, LoadingRegion } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { TransactionsTab } from "./transactions-tab";
import { BudgetsTab } from "./budgets-tab";
import { CategoriesTab } from "./categories-tab";
import { TransactionDialog } from "./transaction-dialog";
import { BudgetDialog } from "./budget-dialog";
import { CategoryDialog } from "./category-dialog";
import type { Budget, Category, FinancePayload, Transaction } from "./types";

type Tab = "transactions" | "budgets" | "categories";

function FinanceSkeleton() {
  return (
    <LoadingRegion label="Loading your finances" className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-11 w-full max-w-md" />
      <Skeleton className="h-96 w-full" />
    </LoadingRegion>
  );
}

export function FinanceManager() {
  const [range, setRange] = React.useState<DateRange>(defaultRange);
  const [tab, setTab] = React.useState<Tab>("transactions");

  const [txnDialog, setTxnDialog] = React.useState<{
    open: boolean;
    transaction: Transaction | null;
  }>({ open: false, transaction: null });
  const [budgetDialog, setBudgetDialog] = React.useState<{
    open: boolean;
    budget: Budget | null;
  }>({ open: false, budget: null });
  const [categoryDialog, setCategoryDialog] = React.useState<{
    open: boolean;
    category: Category | null;
  }>({ open: false, category: null });

  const { confirm, confirmDialog } = useConfirm();

  const { startDate, endDate } = toQueryRange(range);
  const { data, isLoading, error, reload } = useQuery<FinancePayload>(
    `/api/private/finance/aggregate?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
  );

  const transactions = React.useMemo(() => data?.transactions ?? [], [data]);
  const categories = React.useMemo(() => data?.categories ?? [], [data]);
  const budgets = React.useMemo(() => data?.budgets ?? [], [data]);

  const totals = React.useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const txn of transactions) {
      if (txn.type === "income") income += txn.amount;
      else expense += txn.amount;
    }
    return { income, expense, balance: income - expense };
  }, [transactions]);

  const runningBalance = React.useMemo(() => {
    const result = new Map<string, number>();
    const ordered = [...transactions].sort(
      (a, b) =>
        new Date(a.transactionDate).getTime() -
        new Date(b.transactionDate).getTime(),
    );
    let running = 0;
    for (const txn of ordered) {
      running += txn.type === "income" ? txn.amount : -txn.amount;
      result.set(txn._id, running);
    }
    return result;
  }, [transactions]);

  const categoryName = React.useCallback(
    (categoryId: string | undefined) =>
      categories.find((c) => c._id === categoryId)?.name ?? "Uncategorised",
    [categories],
  );

  const handleExportTransactions = () => {
    const ordered = [...transactions].sort(
      (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime(),
    );

    downloadCsv(
      `fee-nance-transactions-${startDate.slice(0, 10)}-to-${endDate.slice(0, 10)}.csv`,
      ["Date", "Title", "Type", "Category", "Amount", "Currency", "Balance", "Notes"],
      ordered.map((txn) => [
        new Date(txn.transactionDate).toISOString().slice(0, 10),
        txn.title,
        txn.type,
        categoryName(txn.categoryId),
        txn.amount,
        txn.currency,
        runningBalance.get(txn._id) ?? "",
        txn.notes ?? "",
      ]),
    );
    toast.success(`Exported ${ordered.length} transaction${ordered.length === 1 ? "" : "s"}`);
  };

  /* ── Delete handlers, all routed through the confirm dialog ─────────── */

  const remove = async (url: string, label: string) => {
    const response = await fetch(url, { method: "DELETE" });
    if (!response.ok) {
      toast.error(await readApiError(response, `Couldn't delete this ${label}`));
      return;
    }
    toast.success(`${label[0].toUpperCase()}${label.slice(1)} deleted`);
    reload();
  };

  const handleDeleteTransaction = async (txn: Transaction) => {
    const ok = await confirm({
      title: `Delete "${txn.title}"?`,
      description:
        "This removes the transaction from your ledger and recalculates your balances. It can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok) await remove(`/api/private/transactions/${txn._id}`, "transaction");
  };

  const handleDeleteBudget = async (budget: Budget) => {
    const ok = await confirm({
      title: `Delete "${budget.name}"?`,
      description:
        "Your transactions stay put — only the budget target is removed.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok) await remove(`/api/private/budgets/${budget._id}`, "budget");
  };

  const handleDeleteCategory = async (category: Category) => {
    const ok = await confirm({
      title: `Delete "${category.name}"?`,
      description:
        "Transactions using this category will become uncategorised. This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok) await remove(`/api/private/categories/${category._id}`, "category");
  };

  /* ── The primary action changes with the active tab ─────────────────── */

  const primaryAction = {
    transactions: {
      label: "New transaction",
      onClick: () => setTxnDialog({ open: true, transaction: null }),
    },
    budgets: {
      label: "New budget",
      onClick: () => setBudgetDialog({ open: true, budget: null }),
    },
    categories: {
      label: "New category",
      onClick: () => setCategoryDialog({ open: true, category: null }),
    },
  }[tab];

  if (isLoading) return <FinanceSkeleton />;

  if (error || !data) {
    return (
      <ErrorState
        title="Couldn't load your finances"
        description="The request didn't come back. Check your connection and try again."
        onRetry={reload}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Range + summary ─────────────────────────────────────────── */}
      <DateRangeFilter value={range} onChange={setRange} onRefresh={reload} />

      <section
        aria-label="Summary for the selected period"
        className="grid gap-4 sm:grid-cols-3"
      >
        <StatCard
          label="Income"
          value={totals.income}
          tone="income"
          icon={ArrowDownLeft}
          hint="Money in"
        />
        <StatCard
          label="Expenses"
          value={totals.expense}
          tone="expense"
          icon={ArrowUpRight}
          hint="Money out"
        />
        <StatCard
          label="Net"
          value={totals.balance}
          tone={totals.balance >= 0 ? "positive" : "negative"}
          icon={Wallet}
          hint={totals.balance >= 0 ? "Surplus" : "Shortfall"}
        />
      </section>

      {/* ── Tabbed workspace ────────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="transactions">
              Transactions
              <span className="tabular ml-1 text-xs text-muted-foreground">
                {transactions.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="budgets">
              Budgets
              <span className="tabular ml-1 text-xs text-muted-foreground">
                {budgets.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="categories">
              Categories
              <span className="tabular ml-1 text-xs text-muted-foreground">
                {categories.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            {tab === "transactions" && transactions.length > 0 && (
              <Button variant="outline" onClick={handleExportTransactions}>
                <Download className="size-4" />
                Export CSV
              </Button>
            )}
            {/* One primary CTA on the screen, scoped to the visible tab. */}
            <Button onClick={primaryAction.onClick} className="sm:w-auto">
              <Plus className="size-4" />
              {primaryAction.label}
            </Button>
          </div>
        </div>

        <TabsContent value="transactions">
          <TransactionsTab
            transactions={transactions}
            categories={categories}
            runningBalance={runningBalance}
            onCreate={() => setTxnDialog({ open: true, transaction: null })}
            onEdit={(transaction) => setTxnDialog({ open: true, transaction })}
            onDelete={handleDeleteTransaction}
          />
        </TabsContent>

        <TabsContent value="budgets">
          <BudgetsTab
            budgets={budgets}
            categories={categories}
            transactions={transactions}
            onCreate={() => setBudgetDialog({ open: true, budget: null })}
            onEdit={(budget) => setBudgetDialog({ open: true, budget })}
            onDelete={handleDeleteBudget}
          />
        </TabsContent>

        <TabsContent value="categories">
          <CategoriesTab
            categories={categories}
            transactions={transactions}
            onCreate={() => setCategoryDialog({ open: true, category: null })}
            onEdit={(category) => setCategoryDialog({ open: true, category })}
            onDelete={handleDeleteCategory}
          />
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ─────────────────────────────────────────────────── */}
      <TransactionDialog
        open={txnDialog.open}
        onOpenChange={(open) => setTxnDialog((c) => ({ ...c, open }))}
        categories={categories}
        transaction={txnDialog.transaction}
        onSaved={reload}
      />
      <BudgetDialog
        open={budgetDialog.open}
        onOpenChange={(open) => setBudgetDialog((c) => ({ ...c, open }))}
        categories={categories}
        budget={budgetDialog.budget}
        onSaved={reload}
      />
      <CategoryDialog
        open={categoryDialog.open}
        onOpenChange={(open) => setCategoryDialog((c) => ({ ...c, open }))}
        category={categoryDialog.category}
        onSaved={reload}
      />

      {confirmDialog}
    </div>
  );
}
