"use client";

import * as React from "react";
import { AlertCircle, Check, Plus, ScanLine, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, toDateInput } from "@/lib/format";
import { readApiError } from "@/lib/use-query";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/field";
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
import type { GroupMember } from "./types";

type SplitType = "equal" | "custom" | "percentage" | "itemized";

const SPLIT_LABELS: Record<SplitType, { label: string; hint: string }> = {
  equal: {
    label: "Split equally",
    hint: "Everyone owes the same share.",
  },
  custom: {
    label: "Exact amounts",
    hint: "Assign a rupee amount per person. Must total the expense.",
  },
  percentage: {
    label: "Percentages",
    hint: "Assign a percentage per person. Must total 100%.",
  },
  itemized: {
    label: "By item",
    hint: "List what was on the bill and tick who shared each line.",
  },
};

interface LineItemDraft {
  /** Local only — a React key. The server assigns real ids on save. */
  key: string;
  label: string;
  amount: string;
  sharedBy: string[];
  proportional: boolean;
}

let lineItemKeySeed = 0;

function newLineItem(overrides: Partial<LineItemDraft> = {}): LineItemDraft {
  lineItemKeySeed += 1;
  return {
    key: `item-${lineItemKeySeed}`,
    label: "",
    amount: "",
    sharedBy: [],
    proportional: false,
    ...overrides,
  };
}

/**
 * Live tally for the payer / split grids. The API rejects anything that
 * doesn't balance exactly, so the mismatch is surfaced here before submit
 * rather than as a server error afterwards.
 */
function AllocationSummary({
  assigned,
  target,
  unit,
}: {
  assigned: number;
  target: number;
  unit: "currency" | "percent";
}) {
  const remaining = target - assigned;
  const balanced = Math.abs(remaining) < 0.01;
  const format = (v: number) =>
    unit === "currency" ? formatCurrency(v) : `${v.toFixed(1)}%`;

  return (
    <p
      aria-live="polite"
      className={cn(
        "mt-3 flex items-center gap-1.5 text-xs font-medium",
        balanced ? "text-success" : "text-warning",
      )}
    >
      {balanced ? (
        <Check className="size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      {balanced
        ? `Balanced — ${format(assigned)} assigned.`
        : remaining > 0
          ? `${format(remaining)} still unassigned.`
          : `${format(Math.abs(remaining))} over the total.`}
    </p>
  );
}

/** Grid of per-member numeric inputs, each with a real label. */
function MemberAmountGrid({
  members,
  values,
  onChange,
  idPrefix,
  suffix,
}: {
  members: GroupMember[];
  values: Record<string, string>;
  onChange: (userId: string, value: string) => void;
  idPrefix: string;
  suffix: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {members.map((member) => {
        const id = `${idPrefix}-${member.userId._id}`;
        return (
          <div key={member.userId._id} className="flex flex-col gap-1.5">
            <Label htmlFor={id} className="truncate text-xs font-normal text-muted-foreground">
              {member.userId.name}
            </Label>
            <div className="relative">
              <Input
                id={id}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={values[member.userId._id] ?? ""}
                onChange={(e) => onChange(member.userId._id, e.target.value)}
                placeholder="0"
                className="h-10 pr-9 text-sm"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
              >
                {suffix}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Repeater for an itemized bill. Members are toggle chips rather than a
 * select because the common action — "this dish was shared by four of the
 * six of us" — should be a few taps, not a few trips through a dropdown.
 */
function LineItemGrid({
  items,
  members,
  onChange,
  onRemove,
  onAdd,
}: {
  items: LineItemDraft[];
  members: GroupMember[];
  onChange: (key: string, patch: Partial<LineItemDraft>) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={item.key}
          className="rounded-3xl border-[1.5px] border-foreground/15 p-4"
        >
          <div className="flex items-start gap-2">
            <Input
              value={item.label}
              onChange={(e) => onChange(item.key, { label: e.target.value })}
              placeholder={`Item ${index + 1}`}
              className="h-10 flex-1 text-sm"
            />
            <div className="relative w-28 shrink-0">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={item.amount}
                onChange={(e) => onChange(item.key, { amount: e.target.value })}
                placeholder="0"
                className="h-10 pr-7 text-sm"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
              >
                ₹
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(item.key)}
              disabled={items.length <= 1}
              aria-label="Remove item"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {members.map((member) => {
              const id = member.userId._id;
              const active = item.sharedBy.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    onChange(item.key, {
                      sharedBy: active
                        ? item.sharedBy.filter((m) => m !== id)
                        : [...item.sharedBy, id],
                    })
                  }
                  className={cn(
                    "rounded-full border-[1.5px] px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-foreground/20 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                  )}
                >
                  {member.userId.name}
                </button>
              );
            })}
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={item.proportional}
              onChange={(e) => onChange(item.key, { proportional: e.target.checked })}
              className="size-3.5 rounded border-[1.5px] border-foreground/40 accent-primary"
            />
            Tax or tip — spread across the priced items instead of split evenly
          </label>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        <Plus className="size-4" />
        Add a line
      </Button>
    </div>
  );
}

/** Rough per-person estimate — the server does the exact paise-accurate math. */
function ItemizedPreview({
  items,
  members,
}: {
  items: LineItemDraft[];
  members: GroupMember[];
}) {
  const totals = React.useMemo(() => {
    const priced = items.filter((item) => !item.proportional);
    const proportional = items.filter((item) => item.proportional);
    const map = new Map<string, number>();

    for (const item of priced) {
      const amount = Number(item.amount) || 0;
      if (!amount || !item.sharedBy.length) continue;
      const share = amount / item.sharedBy.length;
      for (const userId of item.sharedBy) {
        map.set(userId, (map.get(userId) ?? 0) + share);
      }
    }

    const subtotal = new Map(map);

    for (const item of proportional) {
      const amount = Number(item.amount) || 0;
      const weightTotal = item.sharedBy.reduce(
        (sum, userId) => sum + (subtotal.get(userId) ?? 0),
        0,
      );
      if (!amount || !weightTotal) continue;
      for (const userId of item.sharedBy) {
        const weight = subtotal.get(userId) ?? 0;
        map.set(userId, (map.get(userId) ?? 0) + (amount * weight) / weightTotal);
      }
    }

    return map;
  }, [items]);

  const involved = members.filter((member) => (totals.get(member.userId._id) ?? 0) > 0);
  if (!involved.length) return null;

  return (
    <dl className="mt-3 space-y-1 rounded-3xl bg-muted px-4 py-3 text-xs">
      {involved.map((member) => (
        <div key={member.userId._id} className="flex items-center justify-between">
          <dt className="text-muted-foreground">{member.userId.name}</dt>
          <dd className="tabular font-medium">
            {formatCurrency(totals.get(member.userId._id) ?? 0)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ExpenseDialog({
  open,
  onOpenChange,
  groupId,
  members,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  members: GroupMember[];
  onSaved: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [incurredAt, setIncurredAt] = React.useState(toDateInput(new Date()));
  const [splitType, setSplitType] = React.useState<SplitType>("equal");
  const [multiPayer, setMultiPayer] = React.useState(false);
  const [singlePayer, setSinglePayer] = React.useState("");
  const [payerMap, setPayerMap] = React.useState<Record<string, string>>({});
  const [splitMap, setSplitMap] = React.useState<Record<string, string>>({});
  const [lineItems, setLineItems] = React.useState<LineItemDraft[]>([]);
  const [scanning, setScanning] = React.useState(false);
  const [scanAvailable, setScanAvailable] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setAmount("");
    setNotes("");
    setIncurredAt(toDateInput(new Date()));
    setSplitType("equal");
    setMultiPayer(false);
    setSinglePayer(members[0]?.userId._id ?? "");
    setPayerMap({});
    setSplitMap({});
    setLineItems([newLineItem()]);
    setScanning(false);
    setErrors({});
    setSaving(false);
  }, [open, members]);

  // Only offer the scan button when an extractor is actually configured —
  // a button that always fails is worse than no button.
  React.useEffect(() => {
    if (!open) return;
    let active = true;

    fetch("/api/private/receipts/extract")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { configured?: boolean } | null) => {
        if (active) setScanAvailable(Boolean(body?.configured));
      })
      .catch(() => {
        if (active) setScanAvailable(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  const total = Number(amount) || 0;

  const payerAssigned = React.useMemo(
    () =>
      Object.values(payerMap).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [payerMap],
  );

  const splitAssigned = React.useMemo(
    () => Object.values(splitMap).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [splitMap],
  );

  const itemsTotal = React.useMemo(
    () => lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
    [lineItems],
  );

  const updateLineItem = React.useCallback(
    (key: string, patch: Partial<LineItemDraft>) => {
      setLineItems((current) =>
        current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  const removeLineItem = React.useCallback((key: string) => {
    setLineItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const addLineItem = React.useCallback(() => {
    setLineItems((current) => [...current, newLineItem()]);
  }, []);

  // Keep the total in step with the bill's items rather than making the
  // user add them up by hand.
  React.useEffect(() => {
    if (splitType !== "itemized") return;
    if (itemsTotal <= 0) return;
    setAmount(itemsTotal.toFixed(2));
  }, [itemsTotal, splitType]);

  const handleScan = async (file: File) => {
    setScanning(true);
    setErrors((current) => ({ ...current, scan: "" }));

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result);
          resolve(result.slice(result.indexOf(",") + 1));
        };
        reader.onerror = () => reject(new Error("Couldn't read that file"));
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/private/receipts/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimeType: file.type }),
      });

      if (!response.ok) {
        toast.error(await readApiError(response, "Couldn't read that receipt"));
        return;
      }

      const body = (await response.json()) as {
        receipt: { merchant?: string; lineItems: Array<{ label: string; amount: number }> };
      };

      // Pre-fill labels and amounts only. Who shared what is never inferred —
      // that stays a decision the group makes.
      setLineItems(
        body.receipt.lineItems.length
          ? body.receipt.lineItems.map((item) =>
              newLineItem({ label: item.label, amount: String(item.amount) }),
            )
          : [newLineItem()],
      );

      if (body.receipt.merchant && !title.trim()) {
        setTitle(body.receipt.merchant);
      }

      toast.success(
        `Found ${body.receipt.lineItems.length} item${body.receipt.lineItems.length === 1 ? "" : "s"} — check them and tick who shared each.`,
      );
    } catch {
      toast.error("Couldn't read that receipt");
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "What was this expense for?";
    if (!Number.isFinite(total) || total <= 0) {
      next.amount = "Enter an amount greater than zero.";
    }

    // Build the payer list from whichever mode is active.
    const paidBy = multiPayer
      ? Object.entries(payerMap)
          .map(([userId, value]) => ({ userId, amount: Number(value) || 0 }))
          .filter((entry) => entry.amount > 0)
      : singlePayer
        ? [{ userId: singlePayer, amount: total }]
        : [];

    if (!paidBy.length) {
      next.payers = "Record who actually paid.";
    } else if (multiPayer && Math.abs(payerAssigned - total) >= 0.01) {
      next.payers = `Payer contributions must add up to ${formatCurrency(total)}.`;
    }

    let splits;
    let itemPayload;

    if (splitType === "itemized") {
      const filled = lineItems.filter(
        (item) => item.label.trim() && (Number(item.amount) || 0) > 0,
      );

      if (!filled.length) {
        next.splits = "Add at least one item with a name and an amount.";
      } else if (filled.some((item) => !item.sharedBy.length)) {
        next.splits = "Every item needs at least one person assigned to it.";
      } else if (filled.every((item) => item.proportional)) {
        next.splits = "A tax or tip line needs a priced item to spread across.";
      } else if (Math.abs(itemsTotal - total) >= 0.01) {
        next.splits = `Items add up to ${formatCurrency(itemsTotal)}, but the total says ${formatCurrency(total)}.`;
      }

      itemPayload = filled.map((item) => ({
        label: item.label.trim(),
        amount: Number(item.amount),
        sharedBy: item.sharedBy,
        proportional: item.proportional,
      }));
    } else if (splitType !== "equal") {
      const target = splitType === "custom" ? total : 100;
      if (Math.abs(splitAssigned - target) >= 0.01) {
        next.splits =
          splitType === "custom"
            ? `Split amounts must add up to ${formatCurrency(total)}.`
            : "Percentages must add up to 100%.";
      }
      splits = Object.entries(splitMap)
        .map(([userId, value]) =>
          splitType === "custom"
            ? { userId, amount: Number(value) || 0 }
            : { userId, percentage: Number(value) || 0 },
        )
        .filter((entry) =>
          splitType === "custom"
            ? (entry as { amount: number }).amount > 0
            : (entry as { percentage: number }).percentage > 0,
        );
    }

    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    const response = await fetch(`/api/private/groups/${groupId}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        notes: notes.trim() || undefined,
        amount: total,
        splitType,
        paidBy,
        splits,
        lineItems: itemPayload,
        incurredAt: `${incurredAt}T00:00:00.000Z`,
      }),
    });
    setSaving(false);

    if (!response.ok) {
      setErrors({
        form: await readApiError(response, "Couldn't save this expense"),
      });
      return;
    }

    toast.success(`"${title.trim()}" added to the group`);
    onOpenChange(false);
    onSaved();
  };

  const perHead = members.length ? total / members.length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add group expense</DialogTitle>
          <DialogDescription>
            Log what was spent, who paid, and how it should be divided.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="contents">
          <DialogBody className="space-y-5 py-4">
            <Field label="What for?" htmlFor="expense-title" required error={errors.title}>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Dinner, cab, groceries…"
                autoComplete="off"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Total amount" htmlFor="expense-amount" required error={errors.amount}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.01}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </Field>

              <Field label="Date" htmlFor="expense-date" required>
                <Input
                  type="date"
                  value={incurredAt}
                  onChange={(e) => setIncurredAt(e.target.value)}
                />
              </Field>
            </div>

            {/* ── Who paid ──────────────────────────────────────────── */}
            <fieldset className="rounded-3xl border-[1.5px] border-foreground/15 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <legend className="text-sm font-medium">Who paid?</legend>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setMultiPayer((v) => !v)}
                >
                  {multiPayer ? "Just one person paid" : "Several people paid"}
                </Button>
              </div>

              <div className="mt-3">
                {multiPayer ? (
                  <>
                    <MemberAmountGrid
                      members={members}
                      values={payerMap}
                      onChange={(userId, value) =>
                        setPayerMap((c) => ({ ...c, [userId]: value }))
                      }
                      idPrefix="payer"
                      suffix="₹"
                    />
                    <AllocationSummary
                      assigned={payerAssigned}
                      target={total}
                      unit="currency"
                    />
                  </>
                ) : (
                  <Select value={singlePayer} onValueChange={setSinglePayer}>
                    <SelectTrigger aria-label="Who paid">
                      <SelectValue placeholder="Select a member" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((member) => (
                        <SelectItem key={member.userId._id} value={member.userId._id}>
                          {member.userId.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {errors.payers && (
                <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
                  <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                  {errors.payers}
                </p>
              )}
            </fieldset>

            {/* ── How to split ──────────────────────────────────────── */}
            <fieldset className="rounded-3xl border-[1.5px] border-foreground/15 p-4">
              <legend className="text-sm font-medium">How should it split?</legend>

              <div
                role="radiogroup"
                aria-label="Split method"
                className="mt-3 grid gap-1 rounded-full bg-muted p-1 sm:grid-cols-2 lg:grid-cols-4"
              >
                {(Object.keys(SPLIT_LABELS) as SplitType[]).map((type) => {
                  const active = splitType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSplitType(type)}
                      className={cn(
                        "h-10 rounded-full px-3 text-sm font-medium transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        active
                          ? "bg-card text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {SPLIT_LABELS[type].label}
                    </button>
                  );
                })}
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                {SPLIT_LABELS[splitType].hint}
              </p>

              {/* Progressive disclosure — the per-member grid only appears
                  when the chosen method actually needs it. */}
              {splitType === "equal" ? (
                <p className="mt-3 rounded-3xl bg-muted px-3 py-2 text-sm">
                  {members.length
                    ? `${formatCurrency(perHead)} each across ${members.length} member${members.length === 1 ? "" : "s"}.`
                    : "No members to split between yet."}
                </p>
              ) : splitType === "itemized" ? (
                <div className="mt-3 space-y-3">
                  {scanAvailable && (
                    <div className="flex items-center gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) void handleScan(file);
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        loading={scanning}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <ScanLine className="size-4" />
                        Scan a bill
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Fills in the items — you still decide who shared each one.
                      </p>
                    </div>
                  )}

                  <LineItemGrid
                    items={lineItems}
                    members={members}
                    onChange={updateLineItem}
                    onRemove={removeLineItem}
                    onAdd={addLineItem}
                  />

                  <AllocationSummary assigned={itemsTotal} target={total} unit="currency" />

                  <ItemizedPreview items={lineItems} members={members} />
                </div>
              ) : (
                <div className="mt-3">
                  <MemberAmountGrid
                    members={members}
                    values={splitMap}
                    onChange={(userId, value) =>
                      setSplitMap((c) => ({ ...c, [userId]: value }))
                    }
                    idPrefix="split"
                    suffix={splitType === "custom" ? "₹" : "%"}
                  />
                  <AllocationSummary
                    assigned={splitAssigned}
                    target={splitType === "custom" ? total : 100}
                    unit={splitType === "custom" ? "currency" : "percent"}
                  />
                </div>
              )}

              {errors.splits && (
                <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
                  <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                  {errors.splits}
                </p>
              )}
            </fieldset>

            <Field label="Note" htmlFor="expense-notes" hint="Optional context for the group.">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional"
              />
            </Field>

            {errors.form && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md bg-destructive-subtle px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {errors.form}
              </p>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Add expense
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
