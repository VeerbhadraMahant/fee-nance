"use client";

import * as React from "react";
import {
  CalendarCheck,
  CalendarClock,
  Goal as GoalIcon,
  Minus,
  MoreHorizontal,
  PartyPopper,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
} from "lucide-react";

import { formatCurrency, formatDate } from "@/lib/format";
import { projectGoal } from "@/lib/goals";
import { useCreateIntent } from "@/lib/use-create-intent";
import { readApiError, useQuery } from "@/lib/use-query";
import { StatCard } from "@/components/shared/stat-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfettiCanvas, celebrate } from "@/components/ui/confetti";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/misc";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/states";
import { toast } from "@/components/ui/toaster";
import { ContributionDialog, GoalDialog } from "./goal-dialog";
import { THEME_META, type Goal, type GoalsPayload } from "./types";

function monthsLabel(months: number) {
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years}y${rest ? ` ${rest}m` : ""}`;
}

/* ── One goal ──────────────────────────────────────────────────────────── */

function GoalCard({
  goal,
  defaultContribution,
  onEdit,
  onDelete,
  onContribute,
}: {
  goal: Goal;
  defaultContribution: number;
  onEdit: () => void;
  onDelete: () => void;
  onContribute: (mode: "add" | "withdraw") => void;
}) {
  const meta = THEME_META[goal.theme] ?? THEME_META.general;
  const Icon = meta.icon;

  // What-if: drag the monthly amount and watch the finish date move. Starts
  // at this goal's even share of the surplus — or what the date needs, if
  // that's the more useful anchor.
  const baseline = projectGoal(goal, 0);
  const initial = Math.round(
    baseline.requiredMonthly && baseline.requiredMonthly > 0
      ? baseline.requiredMonthly
      : defaultContribution,
  );
  const [monthly, setMonthly] = React.useState(initial);
  const projection = projectGoal(goal, monthly);
  const sliderMax = Math.max(1_000, Math.ceil((Math.max(initial, baseline.remaining / 3) * 2) / 500) * 500);

  return (
    <Card className="flex min-w-0 flex-col gap-5 p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: meta.color }}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold leading-tight">{goal.name}</h3>
          <p className="text-xs text-muted-foreground">
            {meta.label}
            {goal.targetDate ? ` · by ${formatDate(goal.targetDate)}` : ""}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Options for ${goal.name}`} className="-mr-2 -mt-1">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onContribute("withdraw")} disabled={goal.savedAmount <= 0}>
              <Minus />
              Withdraw
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="tabular font-display text-2xl normal-case tracking-normal">
            {formatCurrency(goal.savedAmount, { whole: true })}
          </span>
          <span className="tabular text-sm text-muted-foreground">
            of {formatCurrency(goal.targetAmount, { whole: true })}
          </span>
        </div>
        <Progress
          value={projection.progressPct}
          indicatorColor={meta.color}
          aria-label={`${Math.round(projection.progressPct)}% saved`}
        />
        <p className="text-xs text-muted-foreground">
          {Math.round(projection.progressPct)}% saved
          {!projection.complete && ` · ${formatCurrency(projection.remaining, { whole: true })} to go`}
        </p>
      </div>

      {projection.complete ? (
        <div className="flex items-center gap-2 rounded-2xl bg-success-subtle px-4 py-3 text-sm text-success">
          <PartyPopper className="size-4 shrink-0" aria-hidden="true" />
          Reached{goal.completedAt ? ` on ${formatDate(goal.completedAt)}` : ""}
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl bg-muted px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={`whatif-${goal._id}`} className="text-xs font-medium">
              If you put aside
            </label>
            <span className="tabular text-sm font-semibold">
              {formatCurrency(monthly, { whole: true })}/mo
            </span>
          </div>
          <input
            id={`whatif-${goal._id}`}
            type="range"
            min={0}
            max={sliderMax}
            step={Math.max(100, Math.round(sliderMax / 100 / 100) * 100)}
            value={Math.min(monthly, sliderMax)}
            onChange={(e) => setMonthly(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <p className="flex items-start gap-2 text-sm">
            {projection.onTrack ? (
              <CalendarCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-expense" aria-hidden="true" />
            )}
            <span>
              {projection.projectedDate && projection.monthsToGo !== null
                ? `Done by ${formatDate(projection.projectedDate)} — ${monthsLabel(projection.monthsToGo)}`
                : "At ₹0 a month this goal never finishes"}
              {projection.requiredMonthly !== null && (
                <span className="block text-xs text-muted-foreground">
                  The target date needs {formatCurrency(projection.requiredMonthly, { whole: true })}/mo
                </span>
              )}
            </span>
          </p>
        </div>
      )}

      {!projection.complete && (
        <div className="mt-auto flex gap-2">
          <Button className="flex-1" onClick={() => onContribute("add")}>
            <Plus />
            Add money
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ── Page body ─────────────────────────────────────────────────────────── */

export function GoalsManager() {
  const { data, isLoading, error, reload } = useQuery<GoalsPayload>("/api/private/goals");
  const { confirm, confirmDialog } = useConfirm();

  const [editor, setEditor] = React.useState<{ open: boolean; goal: Goal | null }>({
    open: false,
    goal: null,
  });
  const [contribution, setContribution] = React.useState<{
    goal: Goal | null;
    mode: "add" | "withdraw";
  }>({ goal: null, mode: "add" });

  useCreateIntent("goal", () => setEditor({ open: true, goal: null }));

  const afterSave = ({ justCompleted }: { justCompleted?: boolean }) => {
    if (justCompleted) {
      celebrate();
      toast.success("Goal reached. Well done.");
    }
    reload();
  };

  const handleDelete = async (goal: Goal) => {
    const ok = await confirm({
      title: `Delete "${goal.name}"?`,
      description: "The goal and its progress are removed. Your transactions are not affected.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const response = await fetch(`/api/private/goals/${goal._id}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error(await readApiError(response, "Couldn't delete the goal"));
      return;
    }
    toast.success("Goal deleted");
    reload();
  };

  const dialogs = (
    <>
      <GoalDialog
        open={editor.open}
        goal={editor.goal}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        onSaved={afterSave}
      />
      <ContributionDialog
        goal={contribution.goal}
        mode={contribution.mode}
        onOpenChange={(open) => !open && setContribution((c) => ({ ...c, goal: null }))}
        onSaved={afterSave}
      />
      {confirmDialog}
      <ConfettiCanvas />
    </>
  );

  if (isLoading) {
    return (
      <LoadingRegion label="Loading goals" className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
        {dialogs}
      </LoadingRegion>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Couldn't load your goals"
        description="The request didn't come back. Check your connection and try again."
        onRetry={reload}
      />
    );
  }

  const active = data.goals.filter((g) => g.savedAmount < g.targetAmount);
  const totalSaved = data.goals.reduce((s, g) => s + g.savedAmount, 0);
  const requiredMonthly = active.reduce(
    (s, g) => s + (projectGoal(g, 0).requiredMonthly ?? 0),
    0,
  );
  // Every goal draws on the same surplus. Projecting each one against the
  // whole surplus (as HackMatrix did) promises the same rupee several times.
  const evenShare = active.length ? data.monthlySurplus / active.length : 0;
  const shortfall = requiredMonthly - data.monthlySurplus;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setEditor({ open: true, goal: null })}>
          <Plus />
          New goal
        </Button>
      </div>

      <section aria-label="Goals summary" className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Saved toward goals"
          value={totalSaved}
          icon={PiggyBank}
          tone="positive"
          hint={`${data.goals.length - active.length} of ${data.goals.length} reached`}
        />
        <StatCard
          label="Monthly surplus"
          value={data.monthlySurplus}
          icon={GoalIcon}
          hint={
            data.surplusMonths
              ? `Average of the last ${Math.min(3, data.surplusMonths)} full months`
              : "No completed months yet"
          }
        />
        <StatCard
          label="Dated goals need"
          value={requiredMonthly}
          icon={CalendarClock}
          tone={requiredMonthly > 0 && shortfall > 0 ? "negative" : "neutral"}
          hint={
            requiredMonthly <= 0
              ? "No dated goals in progress"
              : shortfall > 0
                ? `${formatCurrency(shortfall, { whole: true })}/mo more than you save`
                : "Covered by your surplus"
          }
        />
      </section>

      {data.goals.length === 0 ? (
        <EmptyState
          icon={GoalIcon}
          title="No goals yet"
          description="Set a target — a trip, a buffer, a deposit — and see when your current saving gets you there."
          action={
            <Button onClick={() => setEditor({ open: true, goal: null })}>
              <Plus />
              Create your first goal
            </Button>
          }
        />
      ) : (
        <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.goals.map((goal) => (
            <GoalCard
              key={`${goal._id}:${goal.savedAmount}:${goal.targetAmount}:${goal.targetDate ?? ""}`}
              goal={goal}
              defaultContribution={evenShare}
              onEdit={() => setEditor({ open: true, goal })}
              onDelete={() => handleDelete(goal)}
              onContribute={(mode) => setContribution({ goal, mode })}
            />
          ))}
        </div>
      )}

      {active.length > 1 && (
        <p className="measure text-xs text-muted-foreground">
          Each slider starts at what the goal&apos;s date needs, or at an even{" "}
          {formatCurrency(evenShare, { whole: true })}/mo share of your surplus when it has no
          date. Moving a slider is a what-if; it doesn&apos;t save anything.
        </p>
      )}

      {dialogs}
    </div>
  );
}
