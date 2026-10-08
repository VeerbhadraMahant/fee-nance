"use client";

import * as React from "react";
import { Layers, Repeat } from "lucide-react";

import { formatCurrency, formatDate } from "@/lib/format";
import type { DetectedRecurring } from "@/lib/recurring-detect";
import { useQuery } from "@/lib/use-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from "@/components/ui/states";

type Detected = Omit<DetectedRecurring, "lastDate" | "nextExpected"> & {
  lastDate: string;
  nextExpected: string;
};

interface RecurringPayload {
  items: Detected[];
  monthlyTotal: number;
  overlapCount: number;
}

const FREQUENCY_LABEL: Record<DetectedRecurring["frequency"], string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

/**
 * Repeating charges with no recurring rule behind them — the subscriptions
 * the forecast above can't see. Independent of the date range: detection
 * needs a long run of history whatever window is being inspected.
 */
export function RecurringCard() {
  const { data, isLoading, error, reload } = useQuery<RecurringPayload>(
    "/api/private/insights/recurring",
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Repeating charges without a rule</CardTitle>
        <CardDescription>
          Payees that charge you on a schedule but aren&apos;t set up as recurring, so the forecast
          doesn&apos;t count them.
          {data && data.items.length > 0 &&
            ` Together about ${formatCurrency(data.monthlyTotal, { whole: true })} a month.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingRegion label="Detecting recurring charges" className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </LoadingRegion>
        ) : error || !data ? (
          <ErrorState title="Couldn't check for recurring charges" onRetry={reload} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="Nothing unaccounted for"
            description="Either every repeating payment already has a rule, or nothing has repeated three times yet."
          />
        ) : (
          <ul className="space-y-3">
            {data.items.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{item.title}</span>
                    {item.overlapGroup && (
                      <Badge variant="warning">
                        <Layers />
                        Overlaps · {item.overlapGroup}
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {FREQUENCY_LABEL[item.frequency]} · {item.occurrences} times · next around{" "}
                    {formatDate(item.nextExpected)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{Math.round(item.confidence * 100)}% sure</Badge>
                  <span className="tabular font-medium">{formatCurrency(item.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && data.overlapCount > 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            Two services of the same kind is often one more than you use. That&apos;s a guess from the
            names alone — only you know if both earn their keep.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
