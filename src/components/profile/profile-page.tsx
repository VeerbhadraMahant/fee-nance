"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  Check,
  Monitor,
  Moon,
  Pencil,
  Plus,
  ShieldCheck,
  Sun,
  Tags,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { readApiError } from "@/lib/use-query";
import {
  dashboardRangeLabel,
  dashboardRangeValues,
  defaultUserPreferences,
  type DashboardDefaultRange,
} from "@/lib/user-preferences";
import { SectionHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Category {
  _id: string;
  name: string;
  type: "income" | "expense";
  isSystem: boolean;
  color?: string;
}

interface MeResponse {
  user: {
    id: string;
    name: string;
    email: string;
    preferences: {
      currency: "INR";
      dashboardDefaultRange: DashboardDefaultRange;
    };
  };
}

/* ── Theme picker ──────────────────────────────────────────────────────── */

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <div className="space-y-2">
      <Label htmlFor="theme-picker">Appearance</Label>
      <div
        id="theme-picker"
        role="radiogroup"
        aria-label="Appearance"
        className="grid grid-cols-3 gap-2"
      >
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = mounted && theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(value)}
              className={cn(
                "flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        &ldquo;System&rdquo; follows your device&rsquo;s light or dark setting.
      </p>
    </div>
  );
}

/* ── Profile edit dialog ───────────────────────────────────────────────── */

function EditProfileDialog({
  open,
  onOpenChange,
  name,
  email,
  range,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  email: string;
  range: DashboardDefaultRange;
  onSaved: (next: { name: string; range: DashboardDefaultRange }) => void;
}) {
  const [draftName, setDraftName] = React.useState(name);
  const [draftRange, setDraftRange] = React.useState(range);
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDraftName(name);
    setDraftRange(range);
    setError("");
  }, [open, name, range]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (draftName.trim().length < 2) {
      setError("Your name needs at least two characters.");
      document.getElementById("profile-name")?.focus();
      return;
    }

    setSaving(true);
    const response = await fetch("/api/private/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draftName.trim(),
        preferences: { currency: "INR", dashboardDefaultRange: draftRange },
      }),
    });
    setSaving(false);

    if (!response.ok) {
      setError(await readApiError(response, "Couldn't save your changes"));
      return;
    }

    toast.success("Profile updated");
    onSaved({ name: draftName.trim(), range: draftRange });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Update your display name and default dashboard range.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="contents">
          <DialogBody className="space-y-4 py-4">
            <Field
              label="Full name"
              htmlFor="profile-name"
              required
              error={error || undefined}
            >
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={80}
                autoComplete="name"
              />
            </Field>

            {/* Read-only, not disabled — the value still matters to the user. */}
            <Field
              label="Email"
              htmlFor="profile-email"
              hint="Your email is tied to how you sign in and can't be changed here."
            >
              <Input value={email} readOnly tabIndex={-1} />
            </Field>

            <Field
              label="Default dashboard range"
              htmlFor="profile-range"
              hint="The period your dashboard opens on."
            >
              <Select
                value={draftRange}
                onValueChange={(v) => setDraftRange(v as DashboardDefaultRange)}
              >
                <SelectTrigger id="profile-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dashboardRangeValues.map((value) => (
                    <SelectItem key={value} value={value}>
                      {dashboardRangeLabel[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Data integrity check ─────────────────────────────────────────────── */

interface DiagnosticsResult {
  groupsChecked: number;
  expensesChecked: number;
  issues: Array<{ severity: "error" | "warning"; scope: string; message: string }>;
  ok: boolean;
}

function DataIntegrityCard() {
  const [result, setResult] = React.useState<DiagnosticsResult | null>(null);
  const [running, setRunning] = React.useState(false);

  const runCheck = async () => {
    setRunning(true);
    const response = await fetch("/api/private/diagnostics");
    setRunning(false);

    if (!response.ok) {
      toast.error(await readApiError(response, "Couldn't run the data integrity check"));
      return;
    }

    const data = (await response.json()) as DiagnosticsResult;
    setResult(data);
    toast[data.ok ? "success" : "error"](
      data.ok
        ? "All checks passed"
        : `Found ${data.issues.length} issue${data.issues.length === 1 ? "" : "s"}`,
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Data integrity check
        </CardTitle>
        <CardDescription>
          Verifies that every group expense&rsquo;s splits and payments sum to
          its total, and that each group&rsquo;s net balance sums to zero.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {result && (
          <div
            className={cn(
              "rounded-lg border p-3 text-sm",
              result.ok
                ? "border-success/40 bg-success-subtle text-success"
                : "border-destructive/40 bg-destructive-subtle text-destructive",
            )}
          >
            <p className="font-medium">
              {result.ok
                ? `All checks passed — ${result.groupsChecked} group${result.groupsChecked === 1 ? "" : "s"}, ${result.expensesChecked} expense${result.expensesChecked === 1 ? "" : "s"}.`
                : `${result.issues.length} issue${result.issues.length === 1 ? "" : "s"} found:`}
            </p>
            {result.issues.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-1">
                {result.issues.map((issue, i) => (
                  <li key={i}>
                    <span className="font-medium">{issue.scope}:</span> {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button variant="outline" loading={running} onClick={runCheck}>
          Run check
        </Button>
      </CardFooter>
    </Card>
  );
}

/* ── Main ──────────────────────────────────────────────────────────────── */

export function ProfilePage({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const [name, setName] = React.useState(userName);
  const [range, setRange] = React.useState<DashboardDefaultRange>(
    defaultUserPreferences.dashboardDefaultRange,
  );
  const [loadingProfile, setLoadingProfile] = React.useState(true);
  const [editOpen, setEditOpen] = React.useState(false);

  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = React.useState(true);
  const [newName, setNewName] = React.useState("");
  const [newType, setNewType] = React.useState<"income" | "expense">("expense");
  const [addingCat, setAddingCat] = React.useState(false);

  const { confirm, confirmDialog } = useConfirm();

  React.useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/private/me", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as MeResponse;
        if (!mounted) return;
        setName(data.user.name);
        setRange(data.user.preferences.dashboardDefaultRange);
      } catch {
        // Fall back to the server-rendered session values already in state.
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch("/api/private/categories", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { categories: Category[] };
        if (!mounted) return;
        setCategories(data.categories.filter((c) => !c.isSystem));
      } catch {
        if (mounted) toast.error("Couldn't load your categories");
      } finally {
        if (mounted) setLoadingCats(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleAddCategory = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newName.trim()) return;

    setAddingCat(true);
    const res = await fetch("/api/private/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), type: newType }),
    });
    setAddingCat(false);

    if (!res.ok) {
      toast.error(await readApiError(res, "Couldn't create that category"));
      return;
    }

    const data = (await res.json()) as { category: Category };
    setCategories((prev) => [...prev, data.category]);
    setNewName("");
    toast.success(`"${data.category.name}" added`);
  };

  const handleDeleteCategory = async (category: Category) => {
    const ok = await confirm({
      title: `Delete "${category.name}"?`,
      description:
        "Transactions using this category will become uncategorised. This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    const res = await fetch(`/api/private/categories/${category._id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error(await readApiError(res, "Couldn't delete that category"));
      return;
    }
    setCategories((prev) => prev.filter((c) => c._id !== category._id));
    toast.success("Category deleted");
  };

  return (
    <div className="space-y-8">
      {/* ── Identity ────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-5">
          {loadingProfile ? (
            <>
              <Skeleton className="size-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            </>
          ) : (
            <>
              <span
                aria-hidden="true"
                className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary font-display text-xl text-primary-foreground"
              >
                {initials(name)}
              </span>

              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold">{name}</h2>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {userEmail}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Badge variant="success">
                    <Check aria-hidden="true" />
                    Signed in
                  </Badge>
                  <Badge variant="outline">Currency · INR ₹</Badge>
                  <Badge variant="outline">
                    Dashboard · {dashboardRangeLabel[range]}
                  </Badge>
                </div>
              </div>

              <Button onClick={() => setEditOpen(true)} className="shrink-0">
                <Pencil className="size-4" />
                Edit profile
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Appearance ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Fee-Nance is designed for both light and dark. Pick whichever you read
            more comfortably.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ThemePicker />
        </CardContent>
      </Card>

      {/* ── Categories ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Your categories</CardTitle>
          <CardDescription>
            Custom tags you&rsquo;ve added on top of the built-in ones.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {loadingCats ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-24 rounded-full" />
              ))}
            </div>
          ) : categories.length ? (
            <ul className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <li key={category._id}>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm",
                      category.type === "income"
                        ? "border-transparent bg-income-subtle text-income"
                        : "border-transparent bg-expense-subtle text-expense",
                    )}
                  >
                    {category.name}
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(category)}
                      aria-label={`Delete ${category.name}`}
                      className="flex size-7 items-center justify-center rounded-full transition-colors hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring dark:hover:bg-white/10"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Tags}
              title="No custom categories yet"
              description="Add one below — they show up wherever you pick a category."
            />
          )}

          <form
            onSubmit={handleAddCategory}
            className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end"
          >
            <Field label="New category" htmlFor="new-category" className="flex-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Transport, Freelance…"
                maxLength={50}
                autoComplete="off"
              />
            </Field>

            <Field label="Type" htmlFor="new-category-type" className="sm:w-40">
              <Select
                value={newType}
                onValueChange={(v) => setNewType(v as "income" | "expense")}
              >
                <SelectTrigger id="new-category-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Button
              type="submit"
              loading={addingCat}
              disabled={!newName.trim()}
              className="sm:shrink-0"
            >
              <Plus className="size-4" />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Data integrity ──────────────────────────────────────────── */}
      <DataIntegrityCard />

      {/* ── Danger zone ─────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader title="Danger zone" />
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" aria-hidden="true" />
              Delete account
            </CardTitle>
            <CardDescription>
              Permanently removes your account, transactions, budgets and group
              memberships. This can&rsquo;t be undone.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-end">
            {/* Disabled with an explanation, rather than a dead control. */}
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-muted-foreground">
                Not available in this build.
              </p>
              <Button variant="destructive" disabled>
                Delete account
              </Button>
            </div>
          </CardFooter>
        </Card>
      </section>

      <EditProfileDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        name={name}
        email={userEmail}
        range={range}
        onSaved={({ name: nextName, range: nextRange }) => {
          setName(nextName);
          setRange(nextRange);
        }}
      />

      {confirmDialog}
    </div>
  );
}
