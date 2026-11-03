import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Consistent page masthead. One h1 per page, an optional single-sentence
 * subtitle held to a readable measure, and a slot for the page's primary
 * action on the right.
 */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      data-tour="page-header"
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <h1 className="font-display text-2xl sm:text-3xl">{title}</h1>
        {description && (
          <p className="measure text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && (
        <div data-tour="page-action" className="flex shrink-0 items-center gap-2">
          {action}
        </div>
      )}
    </header>
  );
}

/** Sub-section heading used inside a page, below the h1. */
export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        {description && (
          <p className="measure text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
