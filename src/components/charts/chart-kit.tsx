"use client";

import * as React from "react";
import { ResponsiveContainer } from "recharts";

import { cn } from "@/lib/utils";
import { formatCompact, formatCurrency } from "@/lib/format";
import { Skeleton } from "@/components/ui/states";

/** Categorical series colours. Hue-spread so they stay separable under
 *  the common colour-vision deficiencies; never encode meaning by colour
 *  alone — always pair with a label, pattern or icon. */
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
] as const;

export function chartColor(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

/**
 * Wraps a chart with a fixed aspect box (so nothing shifts while data loads),
 * a screen-reader summary, and a loading skeleton of the same height.
 */
export function ChartFrame({
  height = 260,
  loading = false,
  /** One sentence describing the chart's takeaway, for assistive tech. */
  summary,
  className,
  children,
}: {
  height?: number;
  loading?: boolean;
  summary: string;
  className?: string;
  children: React.ReactElement;
}) {
  if (loading) {
    return <Skeleton className={cn("w-full", className)} style={{ height }} />;
  }

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <p className="sr-only">{summary}</p>
      <div aria-hidden="true" className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Tooltip ───────────────────────────────────────────────────────────── */

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

/**
 * Themed tooltip. Values are formatted as currency by default so users read
 * exact amounts rather than eyeballing bar heights.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter = (v: number) => formatCurrency(v),
  hideLabel = false,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  labelFormatter?: (label: string | number) => string;
  valueFormatter?: (value: number, entry: TooltipEntry) => string;
  hideLabel?: boolean;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-36 rounded-lg border-[1.5px] border-foreground bg-popover px-3 py-2 text-xs">
      {!hideLabel && label !== undefined && (
        <p className="mb-1.5 font-medium text-popover-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <ul className="space-y-1">
        {payload.map((entry, index) => (
          <li
            key={`${entry.dataKey ?? index}`}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: entry.color }}
              />
              {entry.name}
            </span>
            <span className="tabular font-medium text-popover-foreground">
              {typeof entry.value === "number"
                ? valueFormatter(entry.value, entry)
                : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Legend ────────────────────────────────────────────────────────────── */

export interface LegendSeries {
  key: string;
  label: string;
  color: string;
  value?: number;
}

/**
 * Interactive legend — each entry is a real button that toggles its series,
 * with aria-pressed reflecting state. Sits above the chart so it is never
 * cut off below a scroll fold.
 */
export function ChartLegend({
  series,
  hidden,
  onToggle,
  className,
}: {
  series: LegendSeries[];
  hidden?: Set<string>;
  onToggle?: (key: string) => void;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      {series.map((item) => {
        const isHidden = hidden?.has(item.key) ?? false;
        const content = (
          <>
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{
                background: isHidden ? "var(--muted-foreground)" : item.color,
                opacity: isHidden ? 0.4 : 1,
              }}
            />
            <span className={cn(isHidden && "line-through opacity-60")}>
              {item.label}
            </span>
            {item.value !== undefined && (
              <span className="tabular text-muted-foreground">
                {formatCompact(item.value)}
              </span>
            )}
          </>
        );

        return (
          <li key={item.key}>
            {onToggle ? (
              <button
                type="button"
                onClick={() => onToggle(item.key)}
                aria-pressed={!isHidden}
                className="flex items-center gap-1.5 rounded-md py-1 text-xs transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {content}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 py-1 text-xs">
                {content}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Manages which series are toggled off in an interactive legend. */
export function useHiddenSeries() {
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());

  const toggle = React.useCallback((key: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return { hidden, toggle };
}

/* ── Shared axis presets ───────────────────────────────────────────────── */

export const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11 },
  stroke: "var(--muted-foreground)",
} as const;

export const currencyAxisProps = {
  ...axisProps,
  width: 56,
  tickFormatter: (value: number) => formatCompact(value),
} as const;
