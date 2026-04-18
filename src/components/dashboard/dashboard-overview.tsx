"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "./use-query";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardSummary {
  totals: {
    income: number;
    expense: number;
    balance: number;
  };
  groupCount: number;
  categoryBreakdown: Array<{
    categoryId: string | null;
    categoryName: string;
    total: number;
  }>;
  monthlyTrend: Array<{
    year: number;
    month: number;
    income: number;
    expense: number;
  }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  .toISOString()
  .slice(0, 10);
const todayIso = today.toISOString().slice(0, 10);

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const FLOW_COLORS = [
  "#7F77DD", "#1d9e75", "#ba7517",
  "#4a9bd4", "#9B5FCF", "#5C5875",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompact(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

// ─── Monthly Performance Mini Chart ──────────────────────────────────────────

function MonthlyPerformanceChart({
  data,
}: {
  data: DashboardSummary["monthlyTrend"];
}) {
  if (!data.length) {
    return (
      <p className="py-4 text-center text-sm text-[var(--color-muted)]">
        No data in range.
      </p>
    );
  }

  const W = 280;
  const H = 110;
  const PL = 4;
  const PR = 4;
  const PT = 6;
  const PB = 22;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;
  const maxVal = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1);
  const slotW = innerW / data.length;
  const barGap = 2;
  const barW = Math.max((slotW - barGap * 3) / 2, 2);
  const baseY = PT + innerH;

  // Latest month savings rate
  const last = data[data.length - 1];
  const savingsRate =
    last?.income > 0
      ? Math.round(((last.income - last.expense) / last.income) * 100)
      : 0;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {data.map((d, i) => {
          const x = PL + i * slotW + barGap;
          const incH = Math.max((d.income / maxVal) * innerH, 2);
          const expH = Math.max((d.expense / maxVal) * innerH, 2);
          const showLabel = data.length <= 7;
          return (
            <g key={i}>
              <rect
                x={x} y={baseY - incH}
                width={barW} height={incH}
                fill="var(--color-accent)" opacity={0.85}
              />
              <rect
                x={x + barW + barGap} y={baseY - expH}
                width={barW} height={expH}
                fill="var(--color-text-tertiary)" opacity={0.65}
              />
              {showLabel && (
                <text
                  x={x + barW} y={H - 5}
                  textAnchor="middle" fontSize={8}
                  fill="currentColor" opacity={0.35}
                >
                  {MONTH_NAMES[d.month - 1]}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend + savings rate */}
      <div className="mt-1.5 flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 bg-[var(--color-accent)]" />
            Income
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 bg-[var(--color-text-tertiary)]" />
            Expenses
          </span>
        </div>
        <span style={{ color: savingsRate >= 20 ? "var(--color-success)" : savingsRate >= 5 ? "var(--color-warning)" : "var(--color-danger)" }}>
          Savings Rate {savingsRate}%
        </span>
      </div>

      {/* Savings rate indicator bar */}
      <div className="mt-2 h-0.5 rounded-full bg-[rgba(255,255,255,0.06)]">
        <div
          className="h-0.5 rounded-full transition-all duration-700"
          style={{
            width: `${Math.max(0, Math.min(100, savingsRate))}%`,
            background:
              savingsRate >= 20
                ? "var(--color-success)"
                : savingsRate >= 5
                  ? "var(--color-warning)"
                  : "var(--color-danger)",
          }}
        />
      </div>
    </div>
  );
}

// ─── Capital Flow Visualization ───────────────────────────────────────────────

function CapitalFlowViz({
  income,
  categories,
}: {
  income: number;
  categories: DashboardSummary["categoryBreakdown"];
}) {
  const W = 880;
  const H = 210;
  const SRC_X = 100;
  const SRC_W = 18;
  const TGT_X = 680;
  const TGT_W = 18;
  const TOP = 16;
  const BOTTOM = 16;
  const GAP = 7;
  const availH = H - TOP - BOTTOM;

  // Top 5 + "other" bucket
  const topCats = categories.slice(0, 5);
  const otherTotal = categories.slice(5).reduce((s, c) => s + c.total, 0);
  const items = [
    ...topCats,
    ...(otherTotal > 0
      ? [{ categoryName: "Other", total: otherTotal, categoryId: null }]
      : []),
  ];

  const totalSpend = items.reduce((s, c) => s + c.total, 0);
  const n = items.length;
  const totalGaps = GAP * Math.max(n - 1, 0);
  const totalValueH = availH - totalGaps;

  // Target bars: proportional to totalSpend, stacked with gaps
  let tgtCursor = TOP;
  const laid = items.map((item, i) => {
    const frac = item.total / Math.max(totalSpend, 1);
    const th = Math.max(frac * totalValueH, 3);
    const entry = {
      ...item,
      tgtY: tgtCursor,
      th,
      color: FLOW_COLORS[i % FLOW_COLORS.length],
    };
    tgtCursor += th + GAP;
    return entry;
  });

  // Source side: each flow gets the same pixel height as its target bar,
  // stacked WITHOUT gaps so they're flush against the source bar.
  let srcCursor = TOP;
  const withSrc = laid.map((item) => {
    const entry = { ...item, srcY: srcCursor, sh: item.th };
    srcCursor += item.th;
    return entry;
  });

  // Total height actually occupied by flows (= totalValueH, no inter-source gaps)
  const srcTotalH = srcCursor - TOP; // == totalValueH
  const flowBandMidY = TOP + srcTotalH / 2;
  const centerX = SRC_X + SRC_W + (TGT_X - SRC_X - SRC_W) / 2;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", minWidth: 500 }}
      >
        {/* Source bar — height matches total flow band exactly, no dangling bottom */}
        <rect
          x={SRC_X} y={TOP}
          width={SRC_W} height={srcTotalH}
          fill="var(--color-accent)" opacity={0.75}
        />
        <text
          x={SRC_X - 12} y={flowBandMidY + 4}
          textAnchor="end" fontSize={10}
          fill="currentColor" opacity={0.45}
          letterSpacing="1"
        >
          INCOME
        </text>

        {/* Center total label */}
        <text
          x={centerX} y={flowBandMidY - 8}
          textAnchor="middle" fontSize={11}
          fill="currentColor" opacity={0.35}
          letterSpacing="1"
        >
          TOTAL FLOW
        </text>
        <text
          x={centerX} y={flowBandMidY + 14}
          textAnchor="middle" fontSize={20}
          fill="currentColor" opacity={0.8}
          fontWeight="500"
        >
          {formatCompact(income)}
        </text>

        {/* Flows + target bars + labels */}
        {withSrc.map((item, i) => {
          const x1 = SRC_X + SRC_W;
          const y1 = item.srcY;
          const y2 = item.srcY + item.sh;
          const x4 = TGT_X;
          const y3 = item.tgtY;
          const y4 = item.tgtY + item.th;
          const cpX = x1 + (x4 - x1) * 0.5;
          const pathD = [
            `M ${x1} ${y1}`,
            `C ${cpX} ${y1}, ${cpX} ${y3}, ${x4} ${y3}`,
            `L ${x4} ${y4}`,
            `C ${cpX} ${y4}, ${cpX} ${y2}, ${x1} ${y2}`,
            "Z",
          ].join(" ");
          // For very small bars, offset label to avoid overlap
          const labelY = Math.max(item.tgtY + item.th / 2 + 4, item.tgtY + 8);
          return (
            <g key={i}>
              <path d={pathD} fill={item.color} opacity={0.2} />
              <rect
                x={TGT_X} y={item.tgtY}
                width={TGT_W} height={item.th}
                fill={item.color} opacity={0.8}
              />
              <text
                x={TGT_X + TGT_W + 10} y={labelY}
                fontSize={11} fill="currentColor" opacity={0.65}
              >
                {item.categoryName}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function DashboardOverview() {
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(todayIso);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showControls, setShowControls] = useState(false);

  const query = useMemo(
    () =>
      `/api/private/dashboard/summary?startDate=${encodeURIComponent(
        `${startDate}T00:00:00.000Z`,
      )}&endDate=${encodeURIComponent(`${endDate}T23:59:59.999Z`)}`,
    [endDate, startDate],
  );

  const { data, isLoading, error, reload } = useQuery<DashboardSummary>(query);

  const handleGenerateRecurring = async () => {
    setIsGenerating(true);
    await fetch("/api/private/transactions/recurring/run", { method: "POST" });
    setIsGenerating(false);
    reload();
  };

  if (isLoading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="panel h-36" />
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="panel h-44" />
          <div className="panel h-44" />
        </div>
        <div className="panel h-52" />
        <div className="panel h-40" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="panel h-24" />
          <div className="panel h-24" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-[var(--color-danger)]">
        Failed to load dashboard summary.
      </p>
    );
  }

  const { totals, categoryBreakdown, monthlyTrend, groupCount } = data;
  const maxCategory = categoryBreakdown.reduce(
    (max, c) => Math.max(max, c.total),
    0,
  );

  // Balance delta as % of income
  const balancePct =
    totals.income > 0
      ? ((totals.balance / totals.income) * 100).toFixed(1)
      : null;
  const balancePositive = totals.balance >= 0;

  return (
    <div className="space-y-5">

      {/* ── Period controls (collapsed by default) ──────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowControls((v) => !v)}
          className="btn-ghost px-3 py-1.5 text-xs"
        >
          {showControls ? "Hide controls" : "Adjust period"}
        </button>
        {showControls && (
          <>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm"
            />
            <span className="text-xs text-[var(--color-text-tertiary)]">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={reload}
              className="btn-ghost px-3 py-1.5 text-sm"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={handleGenerateRecurring}
              disabled={isGenerating}
              className="btn-primary px-3 py-1.5 text-sm disabled:opacity-60"
            >
              {isGenerating ? "Running…" : "Run Recurring"}
            </button>
          </>
        )}
      </div>

      {/* ── Hero KPI + Monthly chart ─────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-[1fr_280px]">

        {/* Balance hero card */}
        <article className="panel p-6">
          <p className="section-overline">NET USABLE BALANCE</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <p
              className="text-5xl font-semibold leading-none tracking-tight"
              style={{
                color: balancePositive
                  ? "var(--color-text)"
                  : "var(--color-danger)",
              }}
            >
              {formatCurrency(totals.balance)}
            </p>
            {balancePct !== null && (
              <span
                className="mb-1 rounded px-2 py-0.5 text-xs font-medium"
                style={{
                  background: balancePositive
                    ? "rgba(29,158,117,0.14)"
                    : "rgba(163,45,45,0.14)",
                  color: balancePositive
                    ? "var(--color-success)"
                    : "var(--color-danger)",
                }}
              >
                {balancePositive ? "+" : ""}{balancePct}%
              </span>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-8 border-t border-[var(--color-border)] pt-4">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
                Gross Income
              </p>
              <p
                className="mt-1 text-xl font-medium"
                style={{ color: "var(--color-accent-mid)" }}
              >
                {formatCurrency(totals.income)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
                Total Expenses
              </p>
              <p
                className="mt-1 text-xl font-medium"
                style={{ color: "var(--color-warning)" }}
              >
                {formatCurrency(totals.expense)}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-tertiary)]">
                Active Groups
              </p>
              <p className="mt-1 text-xl font-medium text-[var(--color-text)]">
                {groupCount}
              </p>
            </div>
          </div>
        </article>

        {/* Monthly performance mini chart */}
        <article className="panel p-5">
          <p className="section-overline mb-4">MONTHLY PERFORMANCE</p>
          <MonthlyPerformanceChart data={monthlyTrend} />
        </article>
      </section>

      {/* ── Capital flow visualization ───────────────────── */}
      {totals.income > 0 && categoryBreakdown.length > 0 && (
        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="section-overline">CAPITAL FLOW VISUALIZATION</p>
            <Link
              href="/analytics"
              className="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-light)] transition-colors"
            >
              Detailed flow →
            </Link>
          </div>
          <CapitalFlowViz
            income={totals.income}
            categories={categoryBreakdown}
          />
        </section>
      )}

      {/* ── Expense breakdown ────────────────────────────── */}
      <section className="panel p-5">
        <p className="section-overline mb-5">EXPENSE BREAKDOWN</p>
        {categoryBreakdown.length ? (
          <div className="space-y-3.5">
            {categoryBreakdown.slice(0, 8).map((item) => {
              const barPct = maxCategory
                ? Math.max((item.total / maxCategory) * 100, 4)
                : 0;
              const ofTotal =
                totals.expense > 0
                  ? (item.total / totals.expense) * 100
                  : 0;
              return (
                <div
                  key={`${item.categoryId}-${item.categoryName}`}
                  className="flex items-center gap-3"
                >
                  <p className="w-28 shrink-0 truncate text-sm text-[var(--color-text-secondary)]">
                    {item.categoryName}
                  </p>
                  <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.05)] overflow-hidden">
                    <div
                      className="h-1.5 transition-all duration-500"
                      style={{
                        width: `${barPct}%`,
                        background: "var(--color-accent)",
                      }}
                    />
                  </div>
                  <div className="flex w-36 shrink-0 items-center justify-end gap-3">
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      {ofTotal.toFixed(1)}%
                    </span>
                    <span className="text-sm font-medium text-[var(--color-text)]">
                      {formatCompact(item.total)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            No expense data in selected range.
          </p>
        )}
      </section>

      {/* ── Feature cards ────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/analytics"
          className="panel p-5 flex items-start gap-4 no-underline group"
        >
          <div
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: "rgba(83,74,183,0.18)",
              color: "var(--color-accent-mid)",
            }}
          >
            <svg
              width="20" height="20"
              fill="none" stroke="currentColor" strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-[var(--color-text)] transition-colors group-hover:text-[var(--color-accent-light)]">
              Deep Analytics
            </p>
            <p className="mt-0.5 text-sm text-[var(--color-text-tertiary)]">
              Flow diagrams, trajectory charts, efficiency reports, and quarterly overviews — all in one place.
            </p>
          </div>
        </Link>

        <Link
          href="/groups"
          className="panel p-5 flex items-start gap-4 no-underline group"
        >
          <div
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: "rgba(29,158,117,0.14)",
              color: "var(--color-success)",
            }}
          >
            <svg
              width="20" height="20"
              fill="none" stroke="currentColor" strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-[var(--color-text)] transition-colors group-hover:text-[var(--color-accent-light)]">
              Group Finance
            </p>
            <p className="mt-0.5 text-sm text-[var(--color-text-tertiary)]">
              {groupCount > 0
                ? `Manage shared expenses across ${groupCount} active group${groupCount !== 1 ? "s" : ""}. Split, settle, and track with clarity.`
                : "Create a group to start splitting expenses with friends, family, or colleagues."}
            </p>
          </div>
        </Link>
      </section>
    </div>
  );
}
