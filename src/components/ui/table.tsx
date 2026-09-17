"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

/** Horizontal overflow is contained here so the page body never scrolls sideways. */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      className={cn("[&_tr]:border-b-[1.5px] [&_tr]:border-border", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-b-[1.5px] border-border transition-colors hover:bg-muted/60 data-[state=selected]:bg-accent data-[state=selected]:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-11 whitespace-nowrap px-3 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("px-3 py-3 align-middle", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      className={cn("mt-3 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

type SortDirection = "asc" | "desc" | null;

/**
 * Sortable header cell. Sets aria-sort so screen readers announce the
 * current sort, and the whole cell is a real button for keyboard users.
 */
function TableSortHead({
  label,
  direction,
  onToggle,
  className,
  align = "left",
}: {
  label: string;
  direction: SortDirection;
  onToggle: () => void;
  className?: string;
  align?: "left" | "right";
}) {
  const Icon =
    direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ChevronsUpDown;

  return (
    <th
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : "none"
      }
      className={cn("h-11 whitespace-nowrap px-3 align-middle", className)}
    >
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-sm text-xs font-semibold uppercase tracking-wider transition-colors hover:text-foreground",
          direction ? "text-foreground" : "text-muted-foreground",
          align === "right" && "justify-end",
        )}
      >
        {label}
        <Icon className={cn("size-3.5", !direction && "opacity-50")} aria-hidden="true" />
      </button>
    </th>
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  TableSortHead,
  type SortDirection,
};
