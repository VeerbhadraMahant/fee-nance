"use client";

import * as React from "react";

import { GOAL_THEMES, type GoalTheme } from "@/lib/goals";
import { toDateInput } from "@/lib/format";
import { readApiError } from "@/lib/use-query";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
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
import { THEME_META, type Goal } from "./types";

interface FormState {
  name: string;
  theme: GoalTheme;
  targetAmount: string;
  savedAmount: string;
  targetDate: string;
}

function toForm(goal?: Goal | null): FormState {
  return {
    name: goal?.name ?? "",
    theme: goal?.theme ?? "general",
    targetAmount: goal ? String(goal.targetAmount) : "",
    savedAmount: goal ? String(goal.savedAmount) : "",
    targetDate: goal?.targetDate ? toDateInput(new Date(goal.targetDate)) : "",
  };
}

export function GoalDialog({
  open,
  onOpenChange,
  goal,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: Goal | null;
  onSaved: (result: { justCompleted?: boolean }) => void;
}) {
  const isEdit = Boolean(goal);
  const [form, setForm] = React.useState<FormState>(() => toForm(goal));
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = React.useState(false);
  const [prevKey, setPrevKey] = React.useState<string | null>(null);
  const [tomorrow] = React.useState(() => toDateInput(new Date(Date.now() + 86_400_000)));

  // Reset the form whenever the dialog opens on a different goal.
  const key = open ? (goal?._id ?? "new") : null;
  if (key !== prevKey) {
    setPrevKey(key);
    if (open) {
      setForm(toForm(goal));
      setErrors({});
    }
  }

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const target = Number(form.targetAmount);
    const saved = form.savedAmount ? Number(form.savedAmount) : 0;
    const next: typeof errors = {};
    if (form.name.trim().length < 2) next.name = "Give the goal a name of at least 2 characters.";
    if (!Number.isFinite(target) || target <= 0) next.targetAmount = "Enter a target above zero.";
    if (!Number.isFinite(saved) || saved < 0) next.savedAmount = "Enter zero or more.";
    else if (saved > target) next.savedAmount = "Saved so far can't be more than the target.";
    if (form.targetDate && new Date(form.targetDate) <= new Date()) {
      next.targetDate = "Pick a date in the future.";
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    const response = await fetch(isEdit ? `/api/private/goals/${goal!._id}` : "/api/private/goals", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        theme: form.theme,
        targetAmount: target,
        savedAmount: saved,
        targetDate: form.targetDate ? `${form.targetDate}T00:00:00.000Z` : null,
      }),
    });
    setSaving(false);

    if (!response.ok) {
      toast.error(await readApiError(response, "Couldn't save the goal"));
      return;
    }

    const body = (await response.json().catch(() => ({}))) as { justCompleted?: boolean };
    toast.success(isEdit ? "Goal updated" : "Goal created");
    onOpenChange(false);
    onSaved({ justCompleted: body.justCompleted });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit goal" : "New savings goal"}</DialogTitle>
          <DialogDescription>
            Name what you&apos;re saving for, how much it takes and, if it matters, by when.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="contents" noValidate>
          <DialogBody className="space-y-4 py-4">
            <Field label="Name" htmlFor="goal-name" required error={errors.name}>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Goa trip, six-month buffer…"
                autoComplete="off"
              />
            </Field>

            <Field label="Kind" htmlFor="goal-theme">
              <Select value={form.theme} onValueChange={(v) => set("theme", v as GoalTheme)}>
                <SelectTrigger id="goal-theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_THEMES.map((theme) => (
                    <SelectItem key={theme} value={theme}>
                      {THEME_META[theme].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target" htmlFor="goal-target" required error={errors.targetAmount}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step={1}
                  value={form.targetAmount}
                  onChange={(e) => set("targetAmount", e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Saved so far" htmlFor="goal-saved" error={errors.savedAmount}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={1}
                  value={form.savedAmount}
                  onChange={(e) => set("savedAmount", e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>

            <Field
              label="Target date"
              htmlFor="goal-date"
              hint="Optional. With a date, you'll see what each month needs to hold."
              error={errors.targetDate}
            >
              <Input
                type="date"
                min={tomorrow}
                value={form.targetDate}
                onChange={(e) => set("targetDate", e.target.value)}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {isEdit ? "Save changes" : "Create goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContributionDialog({
  goal,
  mode,
  onOpenChange,
  onSaved,
}: {
  goal: Goal | null;
  mode: "add" | "withdraw";
  onOpenChange: (open: boolean) => void;
  onSaved: (result: { justCompleted?: boolean }) => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [prevGoal, setPrevGoal] = React.useState<string | null>(null);

  const key = goal ? `${goal._id}:${mode}` : null;
  if (key !== prevGoal) {
    setPrevGoal(key);
    setAmount("");
    setError(null);
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!goal) return;

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount above zero.");
      return;
    }
    if (mode === "withdraw" && value > goal.savedAmount) {
      setError("That's more than has been saved toward this goal.");
      return;
    }

    setSaving(true);
    const response = await fetch(`/api/private/goals/${goal._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contribution: mode === "add" ? value : -value }),
    });
    setSaving(false);

    if (!response.ok) {
      toast.error(await readApiError(response, "Couldn't update the goal"));
      return;
    }

    const body = (await response.json().catch(() => ({}))) as { justCompleted?: boolean };
    toast.success(mode === "add" ? "Added to the goal" : "Withdrawn from the goal");
    onOpenChange(false);
    onSaved({ justCompleted: body.justCompleted });
  };

  return (
    <Dialog open={Boolean(goal)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add to" : "Withdraw from"} {goal?.name}
          </DialogTitle>
          <DialogDescription>
            This only moves the goal&apos;s progress. Your ledger is unchanged — record a
            transaction too if money actually left an account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="contents" noValidate>
          <DialogBody className="py-4">
            <Field label="Amount" htmlFor="goal-contribution" required error={error}>
              <Input
                type="number"
                inputMode="decimal"
                min={1}
                step={1}
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {mode === "add" ? "Add" : "Withdraw"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
