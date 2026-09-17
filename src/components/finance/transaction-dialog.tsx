"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { toDateInput } from "@/lib/format";
import { readApiError } from "@/lib/use-query";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Category, MoneyType, Transaction } from "./types";

interface FormState {
  type: MoneyType;
  title: string;
  notes: string;
  amount: string;
  transactionDate: string;
  categoryId: string;
  recurringEnabled: boolean;
  recurringFrequency: "monthly" | "yearly";
}

function emptyForm(): FormState {
  return {
    type: "expense",
    title: "",
    notes: "",
    amount: "",
    transactionDate: toDateInput(new Date()),
    categoryId: "",
    recurringEnabled: false,
    recurringFrequency: "monthly",
  };
}

function formFromTransaction(txn: Transaction): FormState {
  return {
    type: txn.type,
    title: txn.title,
    notes: txn.notes ?? "",
    amount: String(txn.amount),
    transactionDate: toDateInput(new Date(txn.transactionDate)),
    categoryId: txn.categoryId ?? "",
    recurringEnabled: txn.recurring?.enabled ?? false,
    recurringFrequency: txn.recurring?.frequency ?? "monthly",
  };
}

/** Segmented income/expense control. Each option carries an icon and a word,
 *  so the selection never depends on colour alone. */
function TypeToggle({
  value,
  onChange,
}: {
  value: MoneyType;
  onChange: (value: MoneyType) => void;
}) {
  const options = [
    { id: "expense" as const, label: "Expense", Icon: ArrowUpRight },
    { id: "income" as const, label: "Income", Icon: ArrowDownLeft },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Transaction type"
      className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
    >
      {options.map(({ id, label, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            className={cn(
              "flex h-10 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? id === "income"
                  ? "bg-income-subtle text-income"
                  : "bg-expense-subtle text-expense"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function TransactionDialog({
  open,
  onOpenChange,
  categories,
  transaction,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  /** Present = edit mode, absent = create mode. */
  transaction?: Transaction | null;
  onSaved: () => void;
}) {
  const isEdit = Boolean(transaction);
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  // Reset whenever the dialog opens so a stale draft never leaks between rows.
  React.useEffect(() => {
    if (open) {
      setForm(transaction ? formFromTransaction(transaction) : emptyForm());
      setErrors({});
    }
  }, [open, transaction]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const relevantCategories = categories.filter((c) => c.type === form.type);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.title.trim()) {
      next.title = "Give this transaction a name you'll recognise later.";
    }
    const amount = Number(form.amount);
    if (!form.amount.trim()) {
      next.amount = "Enter an amount.";
    } else if (!Number.isFinite(amount) || amount <= 0) {
      next.amount = "Amount must be a number greater than zero.";
    }
    if (!form.transactionDate) {
      next.transactionDate = "Pick the date this happened.";
    }
    setErrors(next);
    return next;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validate();

    if (Object.keys(found).length) {
      // Move focus to the first field that failed.
      document.getElementById(`txn-${Object.keys(found)[0]}`)?.focus();
      return;
    }

    setSaving(true);
    const payload = {
      type: form.type,
      title: form.title.trim(),
      notes: form.notes.trim() || undefined,
      amount: Number(form.amount),
      categoryId: form.categoryId || undefined,
      transactionDate: `${form.transactionDate}T00:00:00.000Z`,
      recurring: {
        enabled: form.recurringEnabled,
        frequency: form.recurringEnabled ? form.recurringFrequency : undefined,
        nextRunAt: form.recurringEnabled
          ? `${form.transactionDate}T00:00:00.000Z`
          : undefined,
      },
    };

    const response = await fetch(
      isEdit
        ? `/api/private/transactions/${transaction!._id}`
        : "/api/private/transactions",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    setSaving(false);

    if (!response.ok) {
      toast.error(
        await readApiError(
          response,
          isEdit ? "Couldn't update the transaction" : "Couldn't save the transaction",
        ),
      );
      return;
    }

    toast.success(isEdit ? "Transaction updated" : "Transaction added");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit transaction" : "New transaction"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update any detail below. Changes apply immediately."
              : "Record money coming in or going out."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="contents">
          <DialogBody className="space-y-4 py-4">
            <TypeToggle
              value={form.type}
              onChange={(type) => {
                // Categories are type-scoped, so clear any now-invalid choice.
                setForm((c) => ({ ...c, type, categoryId: "" }));
              }}
            />

            <Field label="Title" htmlFor="txn-title" required error={errors.title}>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                onBlur={() => form.title.trim() && setErrors((p) => ({ ...p, title: "" }))}
                placeholder="Groceries, Salary, Rent…"
                autoComplete="off"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Amount"
                htmlFor="txn-amount"
                required
                error={errors.amount}
                hint="In rupees."
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.01}
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  placeholder="0.00"
                />
              </Field>

              <Field
                label="Date"
                htmlFor="txn-transactionDate"
                required
                error={errors.transactionDate}
              >
                <Input
                  type="date"
                  value={form.transactionDate}
                  onChange={(e) => set("transactionDate", e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Category"
              htmlFor="txn-category"
              hint={
                relevantCategories.length
                  ? "Optional — helps your breakdowns stay meaningful."
                  : `No ${form.type} categories yet. Add one from the Categories tab.`
              }
            >
              <Select
                value={form.categoryId || "none"}
                onValueChange={(v) => set("categoryId", v === "none" ? "" : v)}
              >
                <SelectTrigger id="txn-category">
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {relevantCategories.map((category) => (
                    <SelectItem key={category._id} value={category._id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Notes"
              htmlFor="txn-notes"
              hint="Anything you'll want to remember at review time."
            >
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Optional"
                rows={2}
              />
            </Field>

            {/* Recurring options stay collapsed until switched on. */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-0.5">
                  <label
                    htmlFor="txn-recurring"
                    className="text-sm font-medium"
                  >
                    Repeat automatically
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Fee-Nance will regenerate this transaction each period.
                  </p>
                </div>
                <Switch
                  id="txn-recurring"
                  checked={form.recurringEnabled}
                  onCheckedChange={(v) => set("recurringEnabled", v)}
                />
              </div>

              {form.recurringEnabled && (
                <div className="mt-4 border-t border-border pt-4">
                  <Field label="Frequency" htmlFor="txn-frequency">
                    <Select
                      value={form.recurringFrequency}
                      onValueChange={(v) =>
                        set("recurringFrequency", v as "monthly" | "yearly")
                      }
                    >
                      <SelectTrigger id="txn-frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Every month</SelectItem>
                        <SelectItem value="yearly">Every year</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              )}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {isEdit ? "Save changes" : "Add transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
