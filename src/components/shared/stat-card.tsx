import * as React from "react";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/states";

type Tone = "neutral" | "income" | "expense" | "positive" | "negative";

const TONE_STYLES: Record<Tone, { value: string; chip: string }> = {
  neutral: { value: "text-foreground", chip: "bg-muted text-muted-foreground" },
  income: { value: "text-income", chip: "bg-income-subtle text-income" },
  expense: { value: "text-expense", chip: "bg-expense-subtle text-expense" },
  positive: { value: "text-success", chip: "bg-success-subtle text-success" },
  negative: {
    value: "text-destructive",
    chip: "bg-destructive-subtle text-destructive",
  },
};

/**
 * A single headline metric. The delta chip carries an arrow icon as well as
 * colour, so direction is readable without relying on hue.
 */
export function StatCard({
  label,
  value,
  currency = true,
  icon: Icon,
  tone = "neutral",
  delta,
  hint,
  loading = false,
  className,
}: {
  label: string;
  value: number | string;
  currency?: boolean;
  icon?: LucideIcon;
  tone?: Tone;
  /** Percentage change. Sign drives the arrow direction. */
  delta?: number | null;
  hint?: string;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <Card className={cn("p-5", className)}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-8 w-36" />
        <Skeleton className="mt-3 h-3 w-20" />
      </Card>
    );
  }

  const styles = TONE_STYLES[tone];
  const display =
    typeof value === "number" && currency ? formatCurrency(value) : value;
  const DeltaIcon = (delta ?? 0) >= 0 ? TrendingUp : TrendingDown;

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="overline">{label}</p>
        {Icon && (
          <span
            aria-hidden="true"
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full",
              styles.chip,
            )}
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>

      <p
        className={cn(
          "tabular mt-2.5 font-display text-3xl normal-case leading-none tracking-normal",
          styles.value,
        )}
      >
        {display}
      </p>

      <div className="mt-2.5 flex min-h-5 flex-wrap items-center gap-2">
        {delta !== undefined && delta !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              delta >= 0
                ? "bg-success-subtle text-success"
                : "bg-destructive-subtle text-destructive",
            )}
          >
            <DeltaIcon className="size-3" aria-hidden="true" />
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}
