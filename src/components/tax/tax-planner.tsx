"use client";

import * as React from "react";
import { Info, Landmark, Scale, Sparkles, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  compareRegimes,
  EMPTY_DEDUCTIONS,
  LIMIT_24B,
  LIMIT_80C,
  LIMIT_80CCD_1B,
  LIMIT_80D,
  TAX_YEAR_LABEL,
  type DeductionHints,
  type Deductions,
  type RegimeResult,
} from "@/lib/tax";
import { useQuery } from "@/lib/use-query";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ErrorState, LoadingRegion, Skeleton } from "@/components/ui/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TaxProfile {
  annualIncome: number;
  observedIncome: number;
  annualised: boolean;
  observedDays: number;
  hints: DeductionHints;
}

const DEDUCTION_FIELDS: Array<{
  key: keyof Deductions;
  label: string;
  limit?: number;
  hint: string;
}> = [
  { key: "section80C", label: "80C", limit: LIMIT_80C, hint: "EPF, PPF, ELSS, life insurance, tuition" },
  { key: "section80D", label: "80D", limit: LIMIT_80D, hint: "Health insurance premiums" },
  { key: "section80CCD1B", label: "80CCD(1B)", limit: LIMIT_80CCD_1B, hint: "Your own NPS contribution" },
  { key: "section24B", label: "24(b)", limit: LIMIT_24B, hint: "Home-loan interest, self-occupied" },
  { key: "hraExemption", label: "HRA exemption", hint: "From your salary slip — depends on basic pay" },
  { key: "other", label: "Other", hint: "80E, 80G, 80TTA and the rest" },
];

/* ── One regime's column ───────────────────────────────────────────────── */

function RegimeCard({ result, recommended }: { result: RegimeResult; recommended: boolean }) {
  const title = result.regime === "new" ? "New regime" : "Old regime";
  return (
    <Card className={cn("min-w-0", recommended && "ring-2 ring-primary")}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          {recommended && (
            <Badge>
              <Sparkles />
              Lower tax
            </Badge>
          )}
        </div>
        <CardDescription>
          {result.regime === "new"
            ? "The default. ₹75,000 standard deduction, few other deductions."
            : "Opt-in. ₹50,000 standard deduction plus 80C, 80D, HRA and the rest."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        <div>
          <p className="overline">Tax payable</p>
          <p className="tabular mt-1 font-display text-3xl normal-case tracking-normal">
            {formatCurrency(result.netTax, { whole: true })}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatPercent(result.effectiveRatePct)} effective ·{" "}
            {formatCurrency(result.monthlyTakeHome, { whole: true })}/mo after tax
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="whitespace-nowrap text-muted-foreground">Deductions</dt>
          <dd className="tabular text-right">{formatCurrency(result.totalDeductions, { whole: true })}</dd>
          <dt className="whitespace-nowrap text-muted-foreground">Taxable income</dt>
          <dd className="tabular text-right">{formatCurrency(result.taxableIncome, { whole: true })}</dd>
          <dt className="whitespace-nowrap text-muted-foreground">Slab tax</dt>
          <dd className="tabular text-right">{formatCurrency(result.taxBeforeRebate, { whole: true })}</dd>
          <dt className="whitespace-nowrap text-muted-foreground">Rebate / relief</dt>
          <dd className="tabular text-right text-success">
            {result.rebate > 0 ? "−" : ""}
            {formatCurrency(result.rebate, { whole: true })}
          </dd>
          <dt className="whitespace-nowrap text-muted-foreground">4% cess</dt>
          <dd className="tabular text-right">{formatCurrency(result.cess, { whole: true })}</dd>
        </dl>

        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-primary">Slab breakdown</summary>
          <Table className="mt-3">
            <TableHeader>
              <TableRow>
                <TableHead>Slab</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.slabs.map((slab) => (
                <TableRow key={slab.label} className={slab.taxableInSlab === 0 ? "opacity-50" : ""}>
                  <TableCell className="text-xs">{slab.label}</TableCell>
                  <TableCell className="text-right text-xs">{slab.ratePct}%</TableCell>
                  <TableCell className="text-right text-xs">{formatCurrency(slab.tax, { whole: true })}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </details>
      </CardContent>
    </Card>
  );
}

/* ── Calculator ────────────────────────────────────────────────────────── */

function Planner({ profile }: { profile: TaxProfile }) {
  const [income, setIncome] = React.useState(String(Math.round(profile.annualIncome) || ""));
  const [deductions, setDeductions] = React.useState<Record<keyof Deductions, string>>(() => ({
    section80C: profile.hints.section80C ? String(Math.round(profile.hints.section80C)) : "",
    section80D: profile.hints.section80D ? String(Math.round(profile.hints.section80D)) : "",
    section80CCD1B: profile.hints.section80CCD1B ? String(Math.round(profile.hints.section80CCD1B)) : "",
    section24B: profile.hints.section24B ? String(Math.round(profile.hints.section24B)) : "",
    hraExemption: "",
    other: "",
  }));

  const gross = Math.max(0, Number(income) || 0);
  const parsed = React.useMemo(() => {
    const out: Deductions = { ...EMPTY_DEDUCTIONS };
    for (const key of Object.keys(out) as Array<keyof Deductions>) {
      out[key] = Math.max(0, Number(deductions[key]) || 0);
    }
    return out;
  }, [deductions]);

  const comparison = React.useMemo(() => compareRegimes(gross, parsed), [gross, parsed]);
  const { newRegime, oldRegime, recommended, annualSaving, breakEvenExtraDeductions } = comparison;

  const detected = Object.entries(profile.hints).some(([key, v]) => key !== "rentPaid" && v > 0);

  return (
    <div className="space-y-6">
      <section aria-label="Tax summary" className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Gross annual income"
          value={gross}
          icon={Wallet}
          hint={
            profile.annualised
              ? `Annualised from ${profile.observedDays} days of history`
              : "Income recorded over the last 12 months"
          }
        />
        <StatCard
          label="Better regime"
          value={recommended === "new" ? "New regime" : "Old regime"}
          currency={false}
          icon={Scale}
          tone="positive"
          hint={
            annualSaving > 0
              ? `Saves ${formatCurrency(annualSaving, { whole: true })} a year`
              : "Both come out the same"
          }
        />
        <StatCard
          label="Old regime break-even"
          value={breakEvenExtraDeductions}
          icon={Landmark}
          hint={
            breakEvenExtraDeductions > 0
              ? "More deductions needed to make the old regime worth it"
              : recommended === "old"
                ? "Your deductions already favour the old regime"
                : "Not reachable with deductions alone"
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Your numbers</CardTitle>
            <CardDescription>
              Pre-filled from the last year of your ledger. Correct anything that&apos;s off — it
              all recalculates as you type.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <Field
              label="Gross salary for the year"
              htmlFor="tax-income"
              hint="Before any deductions. Your recorded income is only a starting point."
            >
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={1000}
                value={income}
                onChange={(e) => setIncome(e.target.value)}
              />
            </Field>

            <p className="overline pt-2">Old-regime deductions</p>
            {DEDUCTION_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={field.limit ? `${field.label} · up to ${formatCurrency(field.limit, { whole: true })}` : field.label}
                htmlFor={`tax-${field.key}`}
                hint={field.hint}
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={500}
                  placeholder="0"
                  value={deductions[field.key]}
                  onChange={(e) => setDeductions((d) => ({ ...d, [field.key]: e.target.value }))}
                />
              </Field>
            ))}

            {(detected || profile.hints.rentPaid > 0) && (
              <div className="flex gap-2 rounded-2xl bg-info-subtle p-3 text-xs text-info">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>
                  {detected && "Some fields were pre-filled by matching transaction titles (SIP, PPF, insurance, NPS…). "}
                  {profile.hints.rentPaid > 0 &&
                    `You paid ${formatCurrency(profile.hints.rentPaid, { whole: true })} in rent; the HRA exemption it earns depends on your salary structure, so enter it from your payslip.`}
                </p>
              </div>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                setDeductions({
                  section80C: "",
                  section80D: "",
                  section80CCD1B: "",
                  section24B: "",
                  hraExemption: "",
                  other: "",
                })
              }
            >
              Clear deductions
            </Button>
          </CardContent>
        </Card>

        <div className="grid min-w-0 gap-6 xl:grid-cols-2">
          <RegimeCard result={newRegime} recommended={recommended === "new"} />
          <RegimeCard result={oldRegime} recommended={recommended === "old"} />
        </div>
      </div>

      <p className="measure text-xs text-muted-foreground">
        {TAX_YEAR_LABEL} slabs for a resident individual under 60. Not modelled: surcharge above
        ₹50L, senior-citizen limits, and capital gains or other special-rate income. This is a
        planning aid, not tax advice — check the final figure with your employer or a CA.
      </p>
    </div>
  );
}

export function TaxPlanner() {
  const { data, isLoading, error, reload } = useQuery<TaxProfile>("/api/private/tax/profile");

  if (isLoading) {
    return (
      <LoadingRegion label="Loading tax planner" className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-[32rem]" />
      </LoadingRegion>
    );
  }

  if (error || !data) {
    return (
      <ErrorState
        title="Couldn't load your tax profile"
        description="The request didn't come back. Check your connection and try again."
        onRetry={reload}
      />
    );
  }

  return <Planner profile={data} />;
}
