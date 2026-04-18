"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@/components/dashboard/use-query";

type Category = {
  _id: string;
  name: string;
  type: "income" | "expense";
  isSystem: boolean;
};

type Transaction = {
  _id: string;
  type: "income" | "expense";
  title: string;
  notes?: string;
  amount: number;
  transactionDate: string;
  categoryId?: string;
  currency: "INR";
  recurring?: {
    enabled: boolean;
    frequency?: "monthly" | "yearly";
  };
};

type Budget = {
  _id: string;
  name: string;
  amount: number;
  cycle: "monthly" | "quarterly" | "yearly";
  currency: "INR";
  categoryId?: string;
  periodStart: string;
  periodEnd: string;
};

interface FinancePayload {
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
}

type Notice =
  | {
      tone: "error";
      message: string;
    }
  | {
      tone: "success";
      message: string;
    };

const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  .toISOString()
  .slice(0, 10);
const todayIso = today.toISOString().slice(0, 10);

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

export function FinanceManager() {
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(todayIso);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [transactionForm, setTransactionForm] = useState({
    type: "expense" as "income" | "expense",
    title: "",
    notes: "",
    amount: "",
    transactionDate: todayIso,
    categoryId: "",
    recurringEnabled: false,
    recurringFrequency: "monthly" as "monthly" | "yearly",
  });

  const [budgetForm, setBudgetForm] = useState({
    name: "",
    amount: "",
    cycle: "monthly" as "monthly" | "quarterly" | "yearly",
    categoryId: "",
    periodStart: monthStart,
    periodEnd: todayIso,
  });

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    type: "expense" as "income" | "expense",
    icon: "",
    color: "",
  });

  const { data, isLoading, error, reload } = useQuery<FinancePayload>(
    `/api/private/finance/aggregate?startDate=${encodeURIComponent(
      `${startDate}T00:00:00.000Z`,
    )}&endDate=${encodeURIComponent(`${endDate}T23:59:59.999Z`)}`,
  );

  const categoryMap = useMemo(() => {
    return new Map((data?.categories ?? []).map((category) => [category._id, category.name]));
  }, [data?.categories]);

  const totals = useMemo(() => {
    const base = { income: 0, expense: 0 };
    for (const transaction of data?.transactions ?? []) {
      if (transaction.type === "income") {
        base.income += transaction.amount;
      } else {
        base.expense += transaction.amount;
      }
    }

    return {
      income: base.income,
      expense: base.expense,
      balance: base.income - base.expense,
    };
  }, [data?.transactions]);

  const runningBalanceMap = useMemo(() => {
    const result = new Map<string, number>();
    const transactions = [...(data?.transactions ?? [])].sort(
      (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime(),
    );

    let running = 0;
    for (const transaction of transactions) {
      if (transaction.type === "income") {
        running += transaction.amount;
      } else {
        running -= transaction.amount;
      }
      result.set(transaction._id, running);
    }

    return result;
  }, [data?.transactions]);

  const categoryExpenseBreakdown = useMemo(() => {
    const totalsByCategory = new Map<string, number>();
    for (const transaction of data?.transactions ?? []) {
      if (transaction.type !== "expense") {
        continue;
      }

      const key = transaction.categoryId ?? "uncategorized";
      totalsByCategory.set(key, (totalsByCategory.get(key) ?? 0) + transaction.amount);
    }

    return [...totalsByCategory.entries()]
      .map(([key, amount]) => ({
        categoryName: key === "uncategorized" ? "Uncategorized" : (categoryMap.get(key) ?? "Unknown"),
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [categoryMap, data?.transactions]);

  const monthlySummary = useMemo(() => {
    const byMonth = new Map<string, { income: number; expense: number }>();

    for (const transaction of data?.transactions ?? []) {
      const date = new Date(transaction.transactionDate);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const current = byMonth.get(key) ?? { income: 0, expense: 0 };

      if (transaction.type === "income") {
        current.income += transaction.amount;
      } else {
        current.expense += transaction.amount;
      }

      byMonth.set(key, current);
    }

    return [...byMonth.entries()]
      .map(([month, values]) => ({ month, income: values.income, expense: values.expense }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [data?.transactions]);

  const customCategories = useMemo(
    () => (data?.categories ?? []).filter((category) => !category.isSystem),
    [data?.categories],
  );

  async function readApiError(response: Response, fallbackMessage: string) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? fallbackMessage;
  }

  const handleCreateTransaction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);

    const amount = Number(transactionForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice({ tone: "error", message: "Transaction amount must be greater than zero" });
      return;
    }

    const response = await fetch("/api/private/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: transactionForm.type,
        title: transactionForm.title,
        notes: transactionForm.notes || undefined,
        amount,
        categoryId: transactionForm.categoryId || undefined,
        transactionDate: `${transactionForm.transactionDate}T00:00:00.000Z`,
        recurring: {
          enabled: transactionForm.recurringEnabled,
          frequency: transactionForm.recurringEnabled
            ? transactionForm.recurringFrequency
            : undefined,
          nextRunAt: transactionForm.recurringEnabled
            ? `${transactionForm.transactionDate}T00:00:00.000Z`
            : undefined,
        },
      }),
    });

    if (!response.ok) {
      setNotice({
        tone: "error",
        message: await readApiError(response, "Failed to create transaction"),
      });
      return;
    }

    setTransactionForm({
      type: "expense",
      title: "",
      notes: "",
      amount: "",
      transactionDate: todayIso,
      categoryId: "",
      recurringEnabled: false,
      recurringFrequency: "monthly",
    });
    setNotice({ tone: "success", message: "Transaction created" });

    reload();
  };

  const handleCreateBudget = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);

    const amount = Number(budgetForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice({ tone: "error", message: "Budget amount must be greater than zero" });
      return;
    }

    const response = await fetch("/api/private/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: budgetForm.name,
        amount,
        cycle: budgetForm.cycle,
        categoryId: budgetForm.categoryId || undefined,
        periodStart: `${budgetForm.periodStart}T00:00:00.000Z`,
        periodEnd: `${budgetForm.periodEnd}T23:59:59.999Z`,
      }),
    });

    if (!response.ok) {
      setNotice({
        tone: "error",
        message: await readApiError(response, "Failed to create budget"),
      });
      return;
    }

    setBudgetForm({
      name: "",
      amount: "",
      cycle: "monthly",
      categoryId: "",
      periodStart: monthStart,
      periodEnd: todayIso,
    });
    setNotice({ tone: "success", message: "Budget created" });

    reload();
  };

  const handleCreateCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);

    const response = await fetch("/api/private/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: categoryForm.name,
        type: categoryForm.type,
        icon: categoryForm.icon || undefined,
        color: categoryForm.color || undefined,
      }),
    });

    if (!response.ok) {
      setNotice({
        tone: "error",
        message: await readApiError(response, "Failed to create category"),
      });
      return;
    }

    setCategoryForm({
      name: "",
      type: "expense",
      icon: "",
      color: "",
    });
    setNotice({ tone: "success", message: "Category created" });

    reload();
  };

  const handleDeleteTransaction = async (id: string) => {
    setNotice(null);
    if (!window.confirm("Delete this transaction?")) {
      return;
    }

    const response = await fetch(`/api/private/transactions/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice({
        tone: "error",
        message: await readApiError(response, "Failed to delete transaction"),
      });
      return;
    }

    setNotice({ tone: "success", message: "Transaction deleted" });
    reload();
  };

  const handleEditTransaction = async (txn: Transaction) => {
    setNotice(null);
    const title = window.prompt("Edit title", txn.title);
    const amountRaw = window.prompt("Edit amount", String(txn.amount));

    if (!title || !amountRaw) {
      return;
    }

    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice({ tone: "error", message: "Transaction amount must be greater than zero" });
      return;
    }

    const response = await fetch(`/api/private/transactions/${txn._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, amount }),
    });

    if (!response.ok) {
      setNotice({
        tone: "error",
        message: await readApiError(response, "Failed to update transaction"),
      });
      return;
    }

    setNotice({ tone: "success", message: "Transaction updated" });
    reload();
  };

  const handleDeleteBudget = async (id: string) => {
    setNotice(null);
    if (!window.confirm("Delete this budget?")) {
      return;
    }

    const response = await fetch(`/api/private/budgets/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice({
        tone: "error",
        message: await readApiError(response, "Failed to delete budget"),
      });
      return;
    }

    setNotice({ tone: "success", message: "Budget deleted" });
    reload();
  };

  const handleEditBudget = async (budget: Budget) => {
    setNotice(null);
    const name = window.prompt("Edit budget name", budget.name);
    const amountRaw = window.prompt("Edit budget amount", String(budget.amount));

    if (!name || !amountRaw) {
      return;
    }

    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice({ tone: "error", message: "Budget amount must be greater than zero" });
      return;
    }

    const response = await fetch(`/api/private/budgets/${budget._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, amount }),
    });

    if (!response.ok) {
      setNotice({
        tone: "error",
        message: await readApiError(response, "Failed to update budget"),
      });
      return;
    }

    setNotice({ tone: "success", message: "Budget updated" });
    reload();
  };

  const handleEditCategory = async (category: Category) => {
    setNotice(null);
    const name = window.prompt("Edit category name", category.name);

    if (!name) {
      return;
    }

    const response = await fetch(`/api/private/categories/${category._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      setNotice({
        tone: "error",
        message: await readApiError(response, "Failed to update category"),
      });
      return;
    }

    setNotice({ tone: "success", message: "Category updated" });
    reload();
  };

  const handleDeleteCategory = async (category: Category) => {
    setNotice(null);
    if (!window.confirm(`Delete category \"${category.name}\"?`)) {
      return;
    }

    const response = await fetch(`/api/private/categories/${category._id}`, { method: "DELETE" });
    if (!response.ok) {
      setNotice({
        tone: "error",
        message: await readApiError(response, "Failed to delete category"),
      });
      return;
    }

    setNotice({ tone: "success", message: "Category deleted" });
    reload();
  };

  if (isLoading) {
    return <p className="text-sm text-[var(--color-muted)]">Loading finance workspace...</p>;
  }

  if (error || !data) {
    return <p className="text-sm text-red-400">Failed to load finance data.</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Start</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">End</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              reload();
            }}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:border-[var(--color-accent)]"
          >
            Refresh
          </button>
        </div>
        {notice ? (
          <p
            className={`mt-3 text-sm ${
              notice.tone === "error" ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {notice.message}
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Income</p>
          <p className="mt-2 text-xl text-[var(--color-accent)]">{formatCurrency(totals.income)}</p>
        </article>
        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Expense</p>
          <p className="mt-2 text-xl text-[var(--color-accent)]">{formatCurrency(totals.expense)}</p>
        </article>
        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Running Balance</p>
          <p className="mt-2 text-xl text-[var(--color-accent)]">{formatCurrency(totals.balance)}</p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <h2 className="text-lg">Add Transaction</h2>
          <form onSubmit={handleCreateTransaction} className="mt-4 grid gap-3 sm:grid-cols-2">
            <select
              value={transactionForm.type}
              onChange={(event) =>
                setTransactionForm((current) => ({ ...current, type: event.target.value as "income" | "expense" }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <input
              placeholder="Title"
              required
              value={transactionForm.title}
              onChange={(event) =>
                setTransactionForm((current) => ({ ...current, title: event.target.value }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              placeholder="Notes"
              value={transactionForm.notes}
              onChange={(event) =>
                setTransactionForm((current) => ({ ...current, notes: event.target.value }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm sm:col-span-2"
            />
            <input
              type="number"
              placeholder="Amount"
              min={0.01}
              step={0.01}
              required
              value={transactionForm.amount}
              onChange={(event) =>
                setTransactionForm((current) => ({ ...current, amount: event.target.value }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              type="date"
              required
              value={transactionForm.transactionDate}
              onChange={(event) =>
                setTransactionForm((current) => ({ ...current, transactionDate: event.target.value }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <select
              value={transactionForm.categoryId}
              onChange={(event) =>
                setTransactionForm((current) => ({ ...current, categoryId: event.target.value }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="">No Category</option>
              {data.categories
                .filter((category) => category.type === transactionForm.type)
                .map((category) => (
                  <option key={category._id} value={category._id}>
                    {category.name}
                  </option>
                ))}
            </select>
            <select
              value={transactionForm.recurringFrequency}
              onChange={(event) =>
                setTransactionForm((current) => ({
                  ...current,
                  recurringFrequency: event.target.value as "monthly" | "yearly",
                }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-[var(--color-muted)] sm:col-span-2">
              <input
                checked={transactionForm.recurringEnabled}
                onChange={(event) =>
                  setTransactionForm((current) => ({
                    ...current,
                    recurringEnabled: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              Enable recurring for this transaction
            </label>
            <button
              className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-contrast)] sm:col-span-2"
              type="submit"
            >
              Save Transaction
            </button>
          </form>
        </article>

        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <h2 className="text-lg">Add Budget</h2>
          <form onSubmit={handleCreateBudget} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Budget Name"
              required
              value={budgetForm.name}
              onChange={(event) =>
                setBudgetForm((current) => ({ ...current, name: event.target.value }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="Amount"
              min={0.01}
              step={0.01}
              required
              value={budgetForm.amount}
              onChange={(event) =>
                setBudgetForm((current) => ({ ...current, amount: event.target.value }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <select
              value={budgetForm.cycle}
              onChange={(event) =>
                setBudgetForm((current) => ({ ...current, cycle: event.target.value as "monthly" | "yearly" | "quarterly" }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
            <select
              value={budgetForm.categoryId}
              onChange={(event) =>
                setBudgetForm((current) => ({ ...current, categoryId: event.target.value }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="">All Categories</option>
              {data.categories
                .filter((category) => category.type === "expense")
                .map((category) => (
                  <option key={category._id} value={category._id}>
                    {category.name}
                  </option>
                ))}
            </select>
            <input
              type="date"
              required
              value={budgetForm.periodStart}
              onChange={(event) =>
                setBudgetForm((current) => ({ ...current, periodStart: event.target.value }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              type="date"
              required
              value={budgetForm.periodEnd}
              onChange={(event) =>
                setBudgetForm((current) => ({ ...current, periodEnd: event.target.value }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-contrast)] sm:col-span-2"
              type="submit"
            >
              Save Budget
            </button>
          </form>
        </article>

        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <h2 className="text-lg">Add Category</h2>
          <form onSubmit={handleCreateCategory} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Category Name"
              required
              value={categoryForm.name}
              onChange={(event) =>
                setCategoryForm((current) => ({ ...current, name: event.target.value }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <select
              value={categoryForm.type}
              onChange={(event) =>
                setCategoryForm((current) => ({
                  ...current,
                  type: event.target.value as "income" | "expense",
                }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <input
              placeholder="Icon (optional)"
              value={categoryForm.icon}
              onChange={(event) =>
                setCategoryForm((current) => ({ ...current, icon: event.target.value }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <input
              placeholder="Color hex (optional)"
              value={categoryForm.color}
              onChange={(event) =>
                setCategoryForm((current) => ({ ...current, color: event.target.value }))
              }
              className="rounded-md border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-contrast)] sm:col-span-2"
              type="submit"
            >
              Save Category
            </button>
          </form>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <h2 className="text-lg">Transactions</h2>
          <div className="mt-4 space-y-3">
            {data.transactions.map((txn) => (
              <div key={txn._id} className="rounded-md border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm">{txn.title}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {txn.type.toUpperCase()} • {new Date(txn.transactionDate).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                      Category: {txn.categoryId ? (categoryMap.get(txn.categoryId) ?? "Unknown") : "None"}
                    </p>
                  </div>
                  <p className="text-sm text-[var(--color-accent)]">{formatCurrency(txn.amount)}</p>
                </div>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Running balance after this transaction: {formatCurrency(runningBalanceMap.get(txn._id) ?? 0)}
                </p>
                {txn.recurring?.enabled ? (
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Recurring {txn.recurring.frequency ?? "monthly"}
                  </p>
                ) : null}
                <div className="mt-2 flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleEditTransaction(txn)}
                    className="rounded border border-[var(--color-border)] px-2 py-1 hover:border-[var(--color-accent)]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTransaction(txn._id)}
                    className="rounded border border-red-400/60 px-2 py-1 text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!data.transactions.length ? (
              <p className="text-sm text-[var(--color-muted)]">No transactions in selected range.</p>
            ) : null}
          </div>
        </article>

        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <h2 className="text-lg">Budgets</h2>
          <div className="mt-4 space-y-3">
            {data.budgets.map((budget) => (
              <div key={budget._id} className="rounded-md border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm">{budget.name}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {budget.cycle.toUpperCase()} • {new Date(budget.periodStart).toLocaleDateString()} - {" "}
                      {new Date(budget.periodEnd).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                      Category: {budget.categoryId ? (categoryMap.get(budget.categoryId) ?? "Unknown") : "All"}
                    </p>
                  </div>
                  <p className="text-sm text-[var(--color-accent)]">{formatCurrency(budget.amount)}</p>
                </div>
                <div className="mt-2 flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => handleEditBudget(budget)}
                    className="rounded border border-[var(--color-border)] px-2 py-1 hover:border-[var(--color-accent)]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBudget(budget._id)}
                    className="rounded border border-red-400/60 px-2 py-1 text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!data.budgets.length ? (
              <p className="text-sm text-[var(--color-muted)]">No budgets in selected range.</p>
            ) : null}
          </div>
        </article>

        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <h2 className="text-lg">Category Management</h2>
          <div className="mt-4 space-y-3">
            {customCategories.map((category) => (
              <div key={category._id} className="rounded-md border border-[var(--color-border)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm">{category.name}</p>
                    <p className="text-xs text-[var(--color-muted)]">{category.type.toUpperCase()} • CUSTOM</p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => handleEditCategory(category)}
                      className="rounded border border-[var(--color-border)] px-2 py-1 hover:border-[var(--color-accent)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(category)}
                      className="rounded border border-red-400/60 px-2 py-1 text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {!customCategories.length ? (
              <p className="text-sm text-[var(--color-muted)]">No custom categories yet.</p>
            ) : null}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <h2 className="text-lg">Category-wise Expense Summary</h2>
          <div className="mt-4 space-y-2">
            {categoryExpenseBreakdown.length ? (
              categoryExpenseBreakdown.map((entry) => (
                <div key={entry.categoryName} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--color-muted)]">{entry.categoryName}</span>
                  <span className="text-[var(--color-accent)]">{formatCurrency(entry.amount)}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--color-muted)]">No expense summary available.</p>
            )}
          </div>
        </article>

        <article className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
          <h2 className="text-lg">Monthly Summary</h2>
          <div className="mt-4 space-y-2">
            {monthlySummary.length ? (
              monthlySummary.map((entry) => (
                <div key={entry.month} className="rounded-md border border-[var(--color-border)] p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{entry.month}</p>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span>Income</span>
                    <span className="text-[var(--color-accent)]">{formatCurrency(entry.income)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span>Expense</span>
                    <span className="text-[var(--color-accent)]">{formatCurrency(entry.expense)}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--color-muted)]">No monthly summary available.</p>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
