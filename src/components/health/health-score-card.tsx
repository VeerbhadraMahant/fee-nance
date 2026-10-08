"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, HeartPulse } from "lucide-react";

import { cn } from "@/lib/utils";
import type { HealthScore } from "@/lib/health-score";
import { useQuery } from "@/lib/use-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingRegion, Skeleton } from "@/components/ui/states";

const BAND_META: Record<HealthScore["band"], { label: string; tone: string; variant: "success" | "info" | "warning" | "destructive" }> = {
  strong: { label: "Strong", tone: "var(--success)", variant: "success" },
  steady: { label: "Steady", tone: "var(--info)", variant: "info" },
  fragile: { label: "Fragile", tone: "var(--warning)", variant: "warning" },
  "at-risk": { label: "At risk", tone: "var(--destructive)", variant: "destructive" },
};

/** 0–100 ring. The number sits inside, so colour is never the only signal. */
export function ScoreRing({ score, band, size = 136 }: { score: number; band: HealthScore["band"]; size?: number }) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const meta = BAND_META[band];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={meta.tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular font-display text-4xl normal-case leading-none tracking-normal">
          {Math.round(score)}
        </span>
        <span className="text-2xs text-muted-foreground">out of 100</span>
      </div>
    </div>
  );
}

/** The five pillars as labelled bars, each with the reason behind its number. */
export function PillarList({ health, compact = false }: { health: HealthScore; compact?: boolean }) {
  return (
    <ul className={cn("min-w-0 flex-1", compact ? "space-y-2.5" : "space-y-3.5")}>
      {health.subScores.map((pillar) => (
        <li key={pillar.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">
              {pillar.name}
              <span className="ml-1.5 text-2xs font-normal text-muted-foreground">
                {Math.round(pillar.weight * 100)}%
              </span>
            </span>
            <span className="tabular shrink-0 font-medium">{Math.round(pillar.score)}</span>
          </div>
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${pillar.score}%`,
                background: pillar.measured ? "var(--primary)" : "var(--chart-6)",
              }}
            />
          </div>
          {!compact && (
            <p className="text-xs text-muted-foreground">
              {pillar.detail}
              {!pillar.measured && " · neutral score until there's data"}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function HealthBandBadge({ band }: { band: HealthScore["band"] }) {
  const meta = BAND_META[band];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/** Dashboard card: fetches and shows the current score. */
export function HealthScoreCard() {
  const { data, isLoading, error, reload } = useQuery<HealthScore & { monthsOfHistory: number }>(
    "/api/private/health",
  );

  if (isLoading) {
    return (
      <LoadingRegion label="Loading health score">
        <Skeleton className="h-72 rounded-3xl" />
      </LoadingRegion>
    );
  }

  if (error || !data) {
    return <ErrorState title="Couldn't compute your health score" onRetry={reload} />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <HeartPulse className="size-4 text-primary" aria-hidden="true" />
            Financial health
          </CardTitle>
          <HealthBandBadge band={data.band} />
        </div>
        <CardDescription>
          Five measures from your own ledger, weighted and combined.
          {data.monthsOfHistory < 3 && " It firms up once you have three full months recorded."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6 pt-0 sm:flex-row sm:items-start">
        <ScoreRing score={data.overall} band={data.band} />
        <div className="w-full min-w-0 space-y-4">
          <PillarList health={data} />
          <Button asChild variant="link" className="h-auto px-0">
            <Link href="/report">
              See the monthly report
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
