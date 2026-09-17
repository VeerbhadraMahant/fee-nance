"use client";

import * as React from "react";
import { CalendarDays, RotateCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { toDateInput } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface DateRange {
  start: string;
  end: string;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export const PRESETS = [
  {
    id: "this-month",
    label: "This month",
    range: () => ({ start: toDateInput(startOfMonth()), end: toDateInput(new Date()) }),
  },
  {
    id: "last-30",
    label: "Last 30 days",
    range: () => ({ start: toDateInput(daysAgo(30)), end: toDateInput(new Date()) }),
  },
  {
    id: "last-90",
    label: "Last 90 days",
    range: () => ({ start: toDateInput(daysAgo(90)), end: toDateInput(new Date()) }),
  },
  {
    id: "this-year",
    label: "This year",
    range: () => ({
      start: toDateInput(new Date(new Date().getFullYear(), 0, 1)),
      end: toDateInput(new Date()),
    }),
  },
] as const;

export function defaultRange(): DateRange {
  return PRESETS[0].range();
}

/** Turns a UI date range into the ISO bounds the API expects. */
export function toQueryRange({ start, end }: DateRange) {
  return {
    startDate: `${start}T00:00:00.000Z`,
    endDate: `${end}T23:59:59.999Z`,
  };
}

/**
 * Range control with quick presets up front and a custom range tucked behind
 * a popover — the common case is one tap, the rare case is still reachable.
 */
export function DateRangeFilter({
  value,
  onChange,
  onRefresh,
  className,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  onRefresh?: () => void;
  className?: string;
}) {
  const activePreset = PRESETS.find((preset) => {
    const r = preset.range();
    return r.start === value.start && r.end === value.end;
  });

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div
        role="group"
        aria-label="Date range presets"
        className="flex flex-wrap items-center gap-1 rounded-full border-[1.5px] border-foreground bg-transparent p-1"
      >
        {PRESETS.map((preset) => {
          const active = activePreset?.id === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(preset.range())}
              className={cn(
                "h-9 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={activePreset ? "outline" : "secondary"}
            size="sm"
            className="h-10"
          >
            <CalendarDays className="size-4" />
            {activePreset ? "Custom" : `${value.start} → ${value.end}`}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="range-start">From</Label>
            <Input
              id="range-start"
              type="date"
              value={value.start}
              max={value.end}
              onChange={(e) => onChange({ ...value, start: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="range-end">To</Label>
            <Input
              id="range-end"
              type="date"
              value={value.end}
              min={value.start}
              onChange={(e) => onChange({ ...value, end: e.target.value })}
            />
          </div>
        </PopoverContent>
      </Popover>

      {onRefresh && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          aria-label="Refresh data"
          className="text-muted-foreground"
        >
          <RotateCw className="size-4" />
        </Button>
      )}
    </div>
  );
}
