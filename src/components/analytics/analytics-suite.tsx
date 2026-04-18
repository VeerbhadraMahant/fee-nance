"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@/components/dashboard/use-query";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsData {
  dateRange: { startDate: string; endDate: string };
  summary: {
    grossIncome: number;
    totalDeductions: number;
    netIncome: number;
    totalExpenses: number;
    netSavings: number;
    savingsRate: number;
    expenseRatio: number;
  };
  categoryBreakdown: Array<{
    categoryId: string | null;
    categoryName: string;
    total: number;
    percentage: number;
    isDeduction: boolean;
  }>;
  incomeBreakdown: Array<{
    categoryId: string | null;
    categoryName: string;
    total: number;
    percentage: number;
  }>;
  monthlyTrend: Array<{
    year: number;
    month: number;
    income: number;
    expense: number;
    savings: number;
  }>;
  quarterlyData: Array<{
    label: string;
    income: number;
    expense: number;
    savings: number;
  }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_PALETTE = [
  "#7F77DD",  // accent-mid
  "#1d9e75",  // success
  "#ba7517",  // warning
  "#4a9bd4",  // sky blue
  "#9B5FCF",  // violet
  "#a32d2d",  // danger
  "#2a8a7a",  // teal
  "#CF8B3E",  // gold
  "#5C8FD4",  // cornflower
  "#C45C8A",  // rose
];

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number) {
  if (Math.abs(value) >= 1_00_000) {
    return `₹${(value / 1_00_000).toFixed(1)}L`;
  }
  if (Math.abs(value) >= 1_000) {
    return `₹${(value / 1_000).toFixed(1)}K`;
  }
  return `₹${value.toFixed(0)}`;
}

// ─── Chart Tooltip ────────────────────────────────────────────────────────────

interface TooltipInfo {
  x: number;
  y: number;
  title?: string;
  lines: { label: string; value: string; color?: string }[];
}

function ChartTooltip({ tooltip }: { tooltip: TooltipInfo | null }) {
  if (!tooltip) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: tooltip.x,
        top: tooltip.y,
        zIndex: 9999,
        pointerEvents: "none",
        transform: "translateY(-10%)",
        minWidth: 160,
      }}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 py-2 text-sm shadow-xl"
    >
      {tooltip.title && (
        <p className="mb-1.5 border-b border-[var(--color-border)] pb-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-text-secondary)]">
          {tooltip.title}
        </p>
      )}
      {tooltip.lines.map((line, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          {line.color && (
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ background: line.color }}
            />
          )}
          <span className="text-[var(--color-text-tertiary)]">{line.label}</span>
          <span className="ml-auto pl-3 font-medium text-[var(--color-text)]">{line.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Sankey Diagram ───────────────────────────────────────────────────────────

interface SankeyNode {
  label: string;
  value: number;
  color: string;
}

function SankeyDiagram({
  total,
  nodes,
}: {
  total: number;
  nodes: SankeyNode[];
}) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  // Full-height SVG with embedded labels — matches reference aesthetic
  const W = 920;
  const H = 380;
  const SRC_X = 56;
  const SRC_W = 26;
  const TGT_X = 680;
  const TGT_W = 26;
  const TOP = 54;        // room for column headers
  const BOTTOM = 24;
  const LBL = 16;        // gap: right edge of bar → label start
  const GAP = 7;
  const availH = H - TOP - BOTTOM;

  const validNodes = nodes.filter((n) => n.value > 0);
  const totalGaps = GAP * Math.max(validNodes.length - 1, 0);
  const totalValueH = availH - totalGaps;

  let tgtY = TOP;
  const layoutNodes = validNodes.map((node) => {
    const th = Math.max((node.value / total) * totalValueH, 10);
    const entry = { ...node, tgtY, th };
    tgtY += th + GAP;
    return entry;
  });

  let srcOffset = 0;
  const withSrc = layoutNodes.map((node) => {
    const sh = Math.max((node.value / total) * availH, 4);
    const entry = { ...node, srcY: TOP + srcOffset, sh };
    srcOffset += sh;
    return entry;
  });

  const srcMidY = TOP + availH / 2;

  return (
    <>
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", width: "100%", height: "auto" }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Column headers */}
      <text x={SRC_X} y={33} fontSize={12} fill="currentColor" opacity={0.38} letterSpacing="3">
        SOURCES
      </text>
      <text x={TGT_X} y={33} fontSize={12} fill="currentColor" opacity={0.38} letterSpacing="3">
        RETAINED
      </text>

      {/* Source bar */}
      <rect x={SRC_X} y={TOP} width={SRC_W} height={availH} fill="var(--color-accent)" rx={0} opacity={0.7} />

      {/* Source label — positioned mid-left of the flow field */}
      <text
        x={SRC_X + SRC_W + LBL}
        y={srcMidY + 6}
        fontSize={17}
        fill="currentColor"
        opacity={0.5}
        letterSpacing="2"
      >
        GROSS INCOME
      </text>

      {/* Flows + target bars + inline labels */}
      {withSrc.map((node, i) => {
        const x1 = SRC_X + SRC_W;
        const y1 = node.srcY;
        const y2 = node.srcY + node.sh;
        const x4 = TGT_X;
        const y3 = node.tgtY;
        const y4 = node.tgtY + node.th;
        const cpX = x1 + (x4 - x1) * 0.5;

        const pathD = [
          `M ${x1} ${y1}`,
          `C ${cpX} ${y1}, ${cpX} ${y3}, ${x4} ${y3}`,
          `L ${x4} ${y4}`,
          `C ${cpX} ${y4}, ${cpX} ${y2}, ${x1} ${y2}`,
          "Z",
        ].join(" ");

        const midY = node.tgtY + node.th / 2;
        const showLabel = node.th >= 16;
        const showValue = node.th >= 30;
        const labelY = showValue ? midY : midY + 5;

        return (
          <g
            key={`flow-${i}`}
            style={{ cursor: "crosshair" }}
            onMouseMove={(e) =>
              setTooltip({
                x: e.clientX,
                y: e.clientY,
                title: node.label,
                lines: [
                  { label: "Amount", value: formatCurrency(node.value), color: node.color },
                  { label: "Share", value: `${((node.value / total) * 100).toFixed(1)}%` },
                ],
              })
            }
            onMouseLeave={() => setTooltip(null)}
          >
            <path d={pathD} fill={node.color} opacity={0.28} />
            <rect
              x={TGT_X}
              y={node.tgtY}
              width={TGT_W}
              height={node.th}
              fill={node.color}
              rx={0}
              opacity={0.7}
            />
            {showLabel && (
              <text
                x={TGT_X + TGT_W + LBL}
                y={labelY}
                fontSize={14}
                fill="currentColor"
                opacity={0.78}
              >
                {node.label}
              </text>
            )}
            {showValue && (
              <text
                x={TGT_X + TGT_W + LBL}
                y={midY + 16}
                fontSize={12}
                fill="currentColor"
                opacity={0.4}
              >
                {formatCompact(node.value)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
    <ChartTooltip tooltip={tooltip} />
    </>
  );
}

// Sankey legend — compact HTML row for accessibility
function SankeyLegend({ nodes, total }: { nodes: SankeyNode[]; total: number }) {
  return (
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--color-border)] pt-3">
      <div className="flex items-center gap-2 text-base text-[var(--color-text-secondary)]">
        <span className="inline-block h-3 w-3 rounded-sm shrink-0 bg-[var(--color-accent)]" />
        <span className="font-medium">Gross Income</span>
        <span className="text-[var(--color-text-tertiary)]">{formatCompact(total)}</span>
      </div>
      {nodes.filter((n) => n.value > 0).map((node, i) => (
        <div key={i} className="flex items-center gap-2 text-base text-[var(--color-text-secondary)]">
          <span className="inline-block h-3 w-3 rounded-sm shrink-0" style={{ background: node.color }} />
          <span>{node.label}</span>
          <span className="text-[var(--color-text-tertiary)]">{formatCompact(node.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Trajectory Chart ─────────────────────────────────────────────────────────

type ChartMode = "line" | "bar";

const CHART_MODES: { id: ChartMode; label: string }[] = [
  { id: "line", label: "Line" },
  { id: "bar", label: "Bar" },
];

function TrajectoryChartSvg({
  data,
  mode,
}: {
  data: AnalyticsData["monthlyTrend"];
  mode: ChartMode;
}) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const W = 620;
  const H = 220;
  const PL = 56;
  const PR = 16;
  const PT = 12;
  const PB = 32;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;
  const baseY = PT + innerH;

  const maxVal = Math.max(
    ...data.flatMap((d) => [d.income, d.expense, Math.max(d.savings, 0)]),
    1,
  );

  const ys = (v: number) => PT + innerH - (Math.max(v, 0) / maxVal) * innerH;

  const gridLines = 4;
  const grids = Array.from({ length: gridLines + 1 }, (_, i) =>
    PT + (i / gridLines) * innerH,
  );

  const xAxisLabels = data.map((d, i) => {
    const every = data.length > 8 ? 2 : 1;
    if (i % every !== 0) return null;
    const cx =
      mode === "bar"
        ? PL + ((i + 0.5) / data.length) * innerW
        : PL + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    return (
      <text
        key={i}
        x={cx}
        y={H - 6}
        textAnchor="middle"
        fontSize={11}
        fill="currentColor"
        opacity={0.5}
      >
        {MONTH_LABELS[d.month - 1]} {String(d.year).slice(2)}
      </text>
    );
  });

  // ── Line mode ─────────────────────────────────────────────────────────────
  if (mode === "line") {
    const xs = (i: number) =>
      PL + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);

    const makeLine = (vals: number[]) =>
      vals.map((v, i) => `${i === 0 ? "M" : "L"} ${xs(i)} ${ys(v)}`).join(" ");

    const makeArea = (vals: number[]) => {
      const line = makeLine(vals);
      return `${line} L ${xs(vals.length - 1)} ${baseY} L ${xs(0)} ${baseY} Z`;
    };

    return (
      <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {grids.map((gy, i) => (
          <g key={i}>
            <line x1={PL} y1={gy} x2={W - PR} y2={gy} stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
            <text x={PL - 6} y={gy + 4} textAnchor="end" fontSize={11} fill="currentColor" opacity={0.45}>
              {formatCompact(maxVal - (i / gridLines) * maxVal)}
            </text>
          </g>
        ))}
        <path d={makeArea(data.map((d) => d.income))} fill="var(--color-accent)" opacity={0.08} />
        <path d={makeArea(data.map((d) => d.expense))} fill="var(--color-warning)" opacity={0.08} />
        <path d={makeLine(data.map((d) => d.income))} stroke="var(--color-accent-mid)" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d={makeLine(data.map((d) => d.expense))} stroke="var(--color-warning)" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d={makeLine(data.map((d) => d.savings))} stroke="var(--color-success)" strokeWidth={1.5} fill="none" strokeDasharray="5 3" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={xs(i)} cy={ys(d.income)} r={3} fill="var(--color-accent-mid)" />
            <circle cx={xs(i)} cy={ys(d.expense)} r={3} fill="var(--color-warning)" />
            <circle cx={xs(i)} cy={ys(Math.max(d.savings, 0))} r={2.5} fill="var(--color-success)" />
            <rect
              x={xs(i) - (data.length > 1 ? (innerW / (data.length - 1)) / 2 : innerW / 2)}
              y={PT}
              width={data.length > 1 ? innerW / (data.length - 1) : innerW}
              height={innerH}
              fill="transparent"
              style={{ cursor: "crosshair" }}
              onMouseMove={(e) =>
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  title: `${MONTH_LABELS[d.month - 1]} ${d.year}`,
                  lines: [
                    { label: "Income", value: formatCompact(d.income), color: "var(--color-accent-mid)" },
                    { label: "Expense", value: formatCompact(d.expense), color: "var(--color-warning)" },
                    { label: "Savings", value: formatCompact(d.savings), color: "var(--color-success)" },
                  ],
                })
              }
              onMouseLeave={() => setTooltip(null)}
            />
          </g>
        ))}
        {xAxisLabels}
      </svg>
      <ChartTooltip tooltip={tooltip} />
      </>
    );
  }

  // ── Bar (histogram) mode ──────────────────────────────────────────────────
  if (mode === "bar") {
    const slotW = innerW / data.length;
    const BAR_COUNT = 3;
    const BAR_GAP = 1.5;
    const barW = Math.max((slotW - (BAR_COUNT + 1) * BAR_GAP) / BAR_COUNT, 3);

    return (
      <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {grids.map((gy, i) => (
          <g key={i}>
            <line x1={PL} y1={gy} x2={W - PR} y2={gy} stroke="currentColor" strokeOpacity={0.06} strokeWidth={1} />
            <text x={PL - 6} y={gy + 4} textAnchor="end" fontSize={11} fill="currentColor" opacity={0.45}>
              {formatCompact(maxVal - (i / gridLines) * maxVal)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const slotX = PL + i * slotW + BAR_GAP;
          const incH = Math.max((d.income / maxVal) * innerH, 1);
          const expH = Math.max((d.expense / maxVal) * innerH, 1);
          const savH = d.savings > 0 ? Math.max((d.savings / maxVal) * innerH, 1) : 0;
          return (
            <g key={i}>
              <rect
                x={slotX} y={baseY - incH} width={barW} height={incH}
                fill="var(--color-accent-mid)" opacity={0.8} rx={1.5}
                style={{ cursor: "crosshair" }}
                onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, title: `${MONTH_LABELS[d.month - 1]} ${d.year}`, lines: [{ label: "Income", value: formatCompact(d.income), color: "var(--color-accent-mid)" }] })}
                onMouseLeave={() => setTooltip(null)}
              />
              <rect
                x={slotX + barW + BAR_GAP} y={baseY - expH} width={barW} height={expH}
                fill="var(--color-warning)" opacity={0.8} rx={1.5}
                style={{ cursor: "crosshair" }}
                onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, title: `${MONTH_LABELS[d.month - 1]} ${d.year}`, lines: [{ label: "Expense", value: formatCompact(d.expense), color: "var(--color-warning)" }] })}
                onMouseLeave={() => setTooltip(null)}
              />
              {savH > 0 && (
                <rect
                  x={slotX + (barW + BAR_GAP) * 2} y={baseY - savH} width={barW} height={savH}
                  fill="var(--color-success)" opacity={0.75} rx={1.5}
                  style={{ cursor: "crosshair" }}
                  onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, title: `${MONTH_LABELS[d.month - 1]} ${d.year}`, lines: [{ label: "Savings", value: formatCompact(d.savings), color: "var(--color-success)" }] })}
                  onMouseLeave={() => setTooltip(null)}
                />
              )}
            </g>
          );
        })}
        {xAxisLabels}
      </svg>
      <ChartTooltip tooltip={tooltip} />
      </>
    );
  }

  // fallback (never reached, type is now line | bar)
  return null;
}

function TrajectoryChart({ data }: { data: AnalyticsData["monthlyTrend"] }) {
  const [mode, setMode] = useState<ChartMode>("line");

  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)] text-center py-8">
        No trend data in range.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls row: legend + mode toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Legend */}
        <div className="flex items-center gap-6 text-base text-[var(--color-text-secondary)]">
          <span className="flex items-center gap-2">
            <span className="inline-block h-3.5 w-3.5 rounded-full bg-[var(--color-accent-mid)]" />
            Income
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-3.5 w-3.5 rounded-full bg-[var(--color-warning)]" />
            Expenses
          </span>
          <span className="flex items-center gap-2">
            <svg width="22" height="12" className="shrink-0">
              <line x1="0" y1="6" x2="22" y2="6" stroke="var(--color-success)" strokeWidth="1.5" strokeDasharray="4 2" />
            </svg>
            Savings
          </span>
        </div>

        {/* Chart type toggle */}
        <div className="flex rounded-md border border-[var(--color-border)] overflow-hidden text-sm">
          {CHART_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className="px-4 py-1.5 transition-colors"
              style={{
                background:
                  mode === m.id
                    ? "var(--color-accent)"
                    : "transparent",
                color:
                  mode === m.id
                    ? "var(--color-accent-contrast)"
                    : "var(--color-text-secondary)",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart SVG */}
      <div className="overflow-x-auto">
        <div className="min-w-[360px]">
          <TrajectoryChartSvg data={data} mode={mode} />
        </div>
      </div>
    </div>
  );
}

// ─── Donut / Composition Chart ────────────────────────────────────────────────

function DonutChart({
  data,
  total,
}: {
  data: AnalyticsData["categoryBreakdown"];
  total: number;
}) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const SIZE = 180;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const OUTER = 78;
  const INNER = 48;
  const topCategories = data.slice(0, 8);

  if (topCategories.length === 0 || total === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center">
        <p className="text-sm text-[var(--color-muted)]">No expense data.</p>
      </div>
    );
  }

  let angle = -Math.PI / 2;
  const arcs = topCategories.map((item, i) => {
    const sweep = (item.total / total) * 2 * Math.PI;
    const end = angle + sweep;
    const x1 = CX + OUTER * Math.cos(angle);
    const y1 = CY + OUTER * Math.sin(angle);
    const x2 = CX + OUTER * Math.cos(end);
    const y2 = CY + OUTER * Math.sin(end);
    const ix1 = CX + INNER * Math.cos(end);
    const iy1 = CY + INNER * Math.sin(end);
    const ix2 = CX + INNER * Math.cos(angle);
    const iy2 = CY + INNER * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    const d = [
      `M ${x1} ${y1}`,
      `A ${OUTER} ${OUTER} 0 ${large} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${INNER} ${INNER} 0 ${large} 0 ${ix2} ${iy2}`,
      "Z",
    ].join(" ");
    const color = CHART_PALETTE[i % CHART_PALETTE.length];
    const entry = { ...item, d, color };
    angle = end;
    return entry;
  });

  return (
    <div className="space-y-4">
      {/* Donut centered */}
      <div className="flex justify-center">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: 260, height: 260, display: "block" }}>
          {arcs.map((arc, i) => (
            <path
              key={i}
              d={arc.d}
              fill={arc.color}
              stroke="var(--color-panel)"
              strokeWidth={1.5}
              opacity={0.9}
              style={{ cursor: "crosshair" }}
              onMouseMove={(e) =>
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  title: arc.categoryName,
                  lines: [
                    { label: "Amount", value: formatCurrency(arc.total), color: arc.color },
                    { label: "Share", value: `${arc.percentage.toFixed(1)}%` },
                  ],
                })
              }
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
          <text x={CX} y={CY - 4} textAnchor="middle" fontSize={14} fill="currentColor" opacity={0.5}>
            Total
          </text>
          <text x={CX} y={CY + 18} textAnchor="middle" fontSize={18} fill="currentColor" fontWeight="600">
            {formatCompact(total)}
          </text>
        </svg>
      </div>

      {/* Legend — 2-col grid so it stays compact */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {arcs.map((arc, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span className="h-3 w-3 rounded-sm shrink-0" style={{ background: arc.color }} />
            <span className="truncate text-sm text-[var(--color-text-secondary)]">{arc.categoryName}</span>
            <span className="ml-auto text-sm text-[var(--color-muted)] shrink-0">{arc.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

// ─── Quarterly Bar Chart ──────────────────────────────────────────────────────

function QuarterlyBars({
  data,
}: {
  data: AnalyticsData["quarterlyData"];
}) {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  if (data.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)] text-center py-4">
        No quarterly data.
      </p>
    );
  }

  const W = 480;
  const H = 190;
  const PL = 52;
  const PR = 12;
  const PT = 24; // room for savings annotation above bars
  const PB = 32;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;
  const baseY = PT + innerH;

  const maxIncome = Math.max(...data.map((d) => d.income), 1);
  const gridLines = 4;
  const grids = Array.from({ length: gridLines + 1 }, (_, i) =>
    PT + (i / gridLines) * innerH,
  );

  const slotW = innerW / data.length;
  const barW = slotW * 0.6;
  const barOffset = (slotW - barW) / 2;

  const hoverProps = (q: (typeof data)[number]) => ({
    style: { cursor: "crosshair" as const },
    onMouseMove: (e: React.MouseEvent) =>
      setTooltip({
        x: e.clientX,
        y: e.clientY,
        title: q.label,
        lines: [
          { label: "Income", value: formatCompact(q.income), color: "var(--color-accent-mid)" },
          { label: "Expense", value: formatCompact(q.expense), color: "var(--color-warning)" },
          {
            label: "Savings",
            value: formatCompact(q.savings),
            color: q.savings >= 0 ? "var(--color-success)" : "var(--color-danger)",
          },
        ],
      }),
    onMouseLeave: () => setTooltip(null),
  });

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Grid lines + y-axis labels */}
        {grids.map((gy, i) => (
          <g key={i}>
            <line
              x1={PL} y1={gy} x2={W - PR} y2={gy}
              stroke="currentColor" strokeOpacity={0.06} strokeWidth={1}
            />
            <text x={PL - 6} y={gy + 4} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.4}>
              {formatCompact(maxIncome - (i / gridLines) * maxIncome)}
            </text>
          </g>
        ))}

        {data.map((q, i) => {
          const x = PL + i * slotW + barOffset;
          const incH = Math.max((q.income / maxIncome) * innerH, 2);
          const expH = Math.max((q.expense / maxIncome) * innerH, 2);
          const savH = incH - expH;
          const savPos = q.savings >= 0;

          return (
            <g key={i} {...hoverProps(q)}>
              {/* Income — faded full-height background bar */}
              <rect
                x={x} y={baseY - incH} width={barW} height={incH}
                fill="var(--color-accent)" opacity={0.18}
              />
              {/* Expense — solid overlay from bottom */} 
              <rect
                x={x} y={baseY - expH} width={barW} height={expH}
                fill="var(--color-warning)" opacity={0.65}
              />
              {/* Savings cap — green top slice when positive */}
              {savPos && savH > 1 && (
                <rect
                  x={x} y={baseY - incH} width={barW} height={savH}
                  fill="var(--color-success)" opacity={0.75}
                />
              )}
              {/* Deficit marker — red outline when negative */}
              {!savPos && (
                <rect
                  x={x} y={baseY - expH} width={barW} height={Math.min(Math.abs(savH), 4)}
                  fill="var(--color-danger)" opacity={0.9}
                />
              )}

              {/* Quarter label (x-axis) */}
              <text
                x={x + barW / 2} y={baseY + 18}
                textAnchor="middle" fontSize={11} fill="currentColor" opacity={0.55}
              >
                {q.label}
              </text>

              {/* Savings annotation above bar */}
              {incH > 14 && (
                <text
                  x={x + barW / 2} y={baseY - incH - 6}
                  textAnchor="middle" fontSize={10}
                  fill={savPos ? "var(--color-success)" : "var(--color-danger)"}
                  opacity={0.9}
                >
                  {savPos ? "+" : ""}{formatCompact(q.savings)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-1 flex items-center gap-5 px-1 text-xs text-[var(--color-text-tertiary)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 bg-[var(--color-success)]" style={{ opacity: 0.75 }} />
          Savings
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 bg-[var(--color-warning)]" style={{ opacity: 0.65 }} />
          Expenses
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 bg-[var(--color-accent)]" style={{ opacity: 0.3 }} />
          Income
        </span>
      </div>

      <ChartTooltip tooltip={tooltip} />
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
  negative,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  negative?: boolean;
}) {
  const valueColor = negative
    ? "var(--color-danger)"
    : accent
      ? "var(--color-accent)"
      : "var(--color-text)";

  return (
    <article className="panel p-5 flex flex-col gap-1 min-w-0">
      <p className="text-sm uppercase tracking-[0.14em] text-[var(--color-muted)] truncate">
        {label}
      </p>
      <p className="text-3xl font-semibold leading-tight mt-1" style={{ color: valueColor }}>
        {value}
      </p>
      {sub && (
        <p className="text-sm text-[var(--color-text-tertiary)] mt-0.5">{sub}</p>
      )}
    </article>
  );
}

// ─── Efficiency Report ────────────────────────────────────────────────────────

function EfficiencyReport({
  summary,
  categoryBreakdown,
}: {
  summary: AnalyticsData["summary"];
  categoryBreakdown: AnalyticsData["categoryBreakdown"];
}) {
  const { savingsRate, expenseRatio, grossIncome, totalDeductions, netSavings } = summary;
  const topCategory = categoryBreakdown.find((c) => !c.isDeduction);
  const deductionRate = grossIncome > 0 ? (totalDeductions / grossIncome) * 100 : 0;

  const getRating = () => {
    if (savingsRate >= 30) return { label: "Excellent", color: "var(--color-success)" };
    if (savingsRate >= 15) return { label: "Good", color: "var(--color-accent-mid)" };
    if (savingsRate >= 5) return { label: "Fair", color: "var(--color-warning)" };
    return { label: "Critical", color: "var(--color-danger)" };
  };

  const rating = getRating();

  const metrics = [
    {
      label: "Savings Rate",
      value: `${savingsRate.toFixed(1)}%`,
      note: "% of gross income retained",
      color: savingsRate >= 20 ? "var(--color-success)" : "var(--color-warning)",
    },
    {
      label: "Expense Ratio",
      value: `${expenseRatio.toFixed(1)}%`,
      note: "% of income spent",
      color: expenseRatio <= 70 ? "var(--color-success)" : "var(--color-danger)",
    },
    {
      label: "Deduction Rate",
      value: `${deductionRate.toFixed(1)}%`,
      note: "Tax & mandatory deductions",
      color: "var(--color-text-secondary)",
    },
    {
      label: "Net Retained",
      value: formatCompact(netSavings),
      note: "After all outflows",
      color: netSavings >= 0 ? "var(--color-success)" : "var(--color-danger)",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Rating pill */}
      <div className="flex items-center gap-2">
        <span className="section-overline">Overall Rating</span>
        <span
          className="rounded-full px-3 py-1 text-sm font-semibold"
          style={{
            background: `color-mix(in srgb, ${rating.color} 18%, transparent)`,
            color: rating.color,
            border: `1px solid color-mix(in srgb, ${rating.color} 35%, transparent)`,
          }}
        >
          {rating.label}
        </span>
      </div>

      {/* Metric rows */}
      <div className="space-y-3">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-[var(--color-muted)]">{m.label}</p>
              <p className="text-xs text-[var(--color-text-tertiary)]">{m.note}</p>
            </div>
            <p className="text-base font-semibold shrink-0" style={{ color: m.color }}>
              {m.value}
            </p>
          </div>
        ))}
      </div>

      {/* Largest spend */}
      {topCategory && (
        <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--layer-4)] p-4">
          <p className="text-sm uppercase tracking-[0.14em] text-[var(--color-muted)]">
            Largest Spend Category
          </p>
          <p className="mt-1 text-lg text-[var(--color-text)]">{topCategory.categoryName}</p>
          <p className="text-base text-[var(--color-text-tertiary)]">
            {formatCurrency(topCategory.total)} — {topCategory.percentage.toFixed(1)}% of expenses
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

type DatePreset = "week" | "month" | "quarter" | "ytd" | "year" | "custom";

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "week", label: "Past Week" },
  { id: "month", label: "This Month" },
  { id: "quarter", label: "Quarter" },
  { id: "ytd", label: "YTD" },
  { id: "year", label: "Past Year" },
  { id: "custom", label: "Custom" },
];

function getPresetDates(preset: DatePreset): { start: string; end: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const end = fmt(now);

  switch (preset) {
    case "week": {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { start: fmt(s), end };
    }
    case "month":
      return {
        start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
        end,
      };
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return {
        start: fmt(new Date(now.getFullYear(), q * 3, 1)),
        end,
      };
    }
    case "ytd":
      return { start: fmt(new Date(now.getFullYear(), 0, 1)), end };
    case "year": {
      const s = new Date(now);
      s.setFullYear(s.getFullYear() - 1);
      return { start: fmt(s), end };
    }
    default:
      return {
        start: fmt(new Date(now.getFullYear(), now.getMonth() - 11, 1)),
        end,
      };
  }
}

const initialPreset: DatePreset = "year";
const initialDates = getPresetDates(initialPreset);

export function AnalyticsSuite() {
  const [preset, setPreset] = useState<DatePreset>(initialPreset);
  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);

  function applyPreset(p: DatePreset) {
    setPreset(p);
    if (p !== "custom") {
      const dates = getPresetDates(p);
      setStartDate(dates.start);
      setEndDate(dates.end);
    }
  }

  const queryUrl = useMemo(
    () =>
      `/api/private/analytics/summary?startDate=${encodeURIComponent(
        `${startDate}T00:00:00.000Z`,
      )}&endDate=${encodeURIComponent(`${endDate}T23:59:59.999Z`)}`,
    [startDate, endDate],
  );

  const { data, isLoading, error, reload } = useQuery<AnalyticsData>(queryUrl);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="panel h-12" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="panel h-20" />
          ))}
        </div>
        <div className="panel h-56" />
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div className="panel h-52" />
          <div className="panel h-52" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="panel h-44" />
          <div className="panel h-44" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-sm text-[var(--color-danger)]">
        Failed to load analytics data. Please try again.
      </p>
    );
  }

  const { summary, categoryBreakdown, monthlyTrend, quarterlyData } = data;

  // Sankey nodes
  const topExpenses = categoryBreakdown.slice(0, 7);
  const otherExpenses = categoryBreakdown.slice(7);
  const otherTotal = otherExpenses.reduce((s, c) => s + c.total, 0);

  const sankeyNodes: SankeyNode[] = [
    ...topExpenses.map((c, i) => ({
      label: c.categoryName,
      value: c.total,
      color: c.isDeduction ? "var(--color-danger)" : CHART_PALETTE[i % CHART_PALETTE.length],
    })),
    ...(otherTotal > 0 ? [{ label: "Other", value: otherTotal, color: "var(--color-text-tertiary)" }] : []),
    ...(summary.netSavings > 0
      ? [{ label: "Net Savings", value: summary.netSavings, color: "var(--color-success)" }]
      : []),
  ];

  return (
    <div className="space-y-5">
      {/* ── Period selector ─────────────────────────────────── */}
      <section className="panel p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset pills */}
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden text-sm shrink-0">
            {DATE_PRESETS.filter((p) => p.id !== "custom").map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className="px-4 py-2 transition-colors"
                style={{
                  background: preset === p.id ? "var(--color-accent)" : "transparent",
                  color: preset === p.id ? "var(--color-text)" : "var(--color-text-secondary)",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom range */}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPreset("custom"); }}
              className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--color-text-secondary)]"
            />
            <span className="text-[var(--color-text-tertiary)] text-sm">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPreset("custom"); }}
              className="rounded border border-[var(--color-border)] bg-transparent px-2 py-1.5 text-sm text-[var(--color-text-secondary)]"
            />
            <button
              type="button"
              onClick={reload}
              className="btn-ghost px-3 py-1.5 text-sm"
            >
              Refresh
            </button>
          </div>
        </div>
      </section>

      {/* ── KPI Cards ───────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        <KpiCard label="Gross Income" value={formatCurrency(summary.grossIncome)} sub="Total inflows" accent />
        <KpiCard label="Total Deductions" value={formatCurrency(summary.totalDeductions)} sub="Tax & mandatory" negative={summary.totalDeductions > 0} />
        <KpiCard label="Net Income" value={formatCurrency(summary.netIncome)} sub="After deductions" />
        <KpiCard label="Total Expenses" value={formatCurrency(summary.totalExpenses)} sub="Discretionary" negative={summary.totalExpenses > summary.grossIncome} />
        <KpiCard
          label="Net Savings"
          value={formatCurrency(summary.netSavings)}
          sub={`${summary.savingsRate.toFixed(1)}% savings rate`}
          negative={summary.netSavings < 0}
          accent={summary.netSavings >= 0}
        />
      </section>

      {/* ── Sankey ──────────────────────────────────────────── */}
      <section className="panel p-5 overflow-hidden">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="section-overline">Financial Flow Architecture</p>
            <h2 className="text-xl font-display">
              Where does your money <span className="display-highlight">go?</span>
            </h2>
          </div>
          <p className="text-sm text-[var(--color-text-tertiary)] shrink-0 mt-1">
            {formatCompact(summary.grossIncome)} total
          </p>
        </div>
        {summary.grossIncome > 0 && sankeyNodes.length > 0 ? (
          <>
            <SankeyDiagram total={summary.grossIncome} nodes={sankeyNodes} />
            <SankeyLegend nodes={sankeyNodes} total={summary.grossIncome} />
          </>
        ) : (
          <p className="text-sm text-[var(--color-muted)] py-6 text-center">
            No data to render flow diagram.
          </p>
        )}
      </section>

      {/* ── Trajectory + Composition ────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="panel p-5 overflow-hidden">
          <div className="mb-4 space-y-1">
            <p className="section-overline">Trend</p>
            <h2 className="text-xl font-display">
              Financial <span className="display-highlight">trajectory</span>
            </h2>
          </div>
          <TrajectoryChart data={monthlyTrend} />
        </article>

        <article className="panel p-5 overflow-hidden">
          <div className="mb-4 space-y-1">
            <p className="section-overline">Composition</p>
            <h2 className="text-xl font-display">
              Expenditure <span className="display-highlight">taxonomy</span>
            </h2>
          </div>
          <DonutChart data={categoryBreakdown} total={summary.totalExpenses} />
        </article>
      </section>

      {/* ── Efficiency + Quarterly ───────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="panel p-5">
          <div className="mb-4 space-y-1">
            <p className="section-overline">Performance</p>
            <h2 className="text-xl font-display">
              Efficiency <span className="display-highlight">report</span>
            </h2>
          </div>
          <EfficiencyReport summary={summary} categoryBreakdown={categoryBreakdown} />
        </article>

        <article className="panel p-5">
          <div className="mb-4 space-y-1">
            <p className="section-overline">Outlook</p>
            <h2 className="text-xl font-display">
              Quarterly <span className="display-highlight">overview</span>
            </h2>
          </div>
          <QuarterlyBars data={quarterlyData} />
        </article>
      </section>
    </div>
  );
}
