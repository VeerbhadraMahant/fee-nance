/**
 * Indian income tax: new regime (default) against old regime, for a resident
 * individual below 60 with salary income.
 *
 * Ported from the HackMatrix (FinPilot) tax engine, with the slabs brought up
 * to date. HackMatrix still carried the FY 2024-25 new-regime slabs (₹3L
 * exemption, ₹7L rebate ceiling); Budget 2025 replaced them and Budget 2026
 * kept the replacement for tax year 2026-27, so those are what's here.
 *
 * Deliberately out of scope, and said so in the UI:
 *   - surcharge above ₹50L taxable income (and its own marginal relief)
 *   - senior / super-senior citizen exemption limits
 *   - special-rate income (capital gains, lottery) which is taxed outside slabs
 *
 * Pure: no I/O, so it runs in the browser for the what-if sliders and in
 * `verify-calculations.ts` for the arithmetic checks.
 */

export const TAX_YEAR_LABEL = "FY 2026-27";

export const NEW_REGIME_STD_DEDUCTION = 75_000;
export const OLD_REGIME_STD_DEDUCTION = 50_000;

export const LIMIT_80C = 150_000;
/** ₹25k self/family plus ₹50k for senior-citizen parents. */
export const LIMIT_80D = 75_000;
export const LIMIT_80CCD_1B = 50_000;
/** Interest on a self-occupied home loan. */
export const LIMIT_24B = 200_000;

const CESS_RATE = 0.04;

/** [lower, upper, rate%] — `upper` is Infinity on the top band. */
type Band = readonly [number, number, number];

const NEW_REGIME_BANDS: Band[] = [
  [0, 400_000, 0],
  [400_000, 800_000, 5],
  [800_000, 1_200_000, 10],
  [1_200_000, 1_600_000, 15],
  [1_600_000, 2_000_000, 20],
  [2_000_000, 2_400_000, 25],
  [2_400_000, Infinity, 30],
];

/** Full rebate when taxable income is at or below this (new regime). */
const NEW_REGIME_REBATE_CEILING = 1_200_000;

const OLD_REGIME_BANDS: Band[] = [
  [0, 250_000, 0],
  [250_000, 500_000, 5],
  [500_000, 1_000_000, 20],
  [1_000_000, Infinity, 30],
];

const OLD_REGIME_REBATE_CEILING = 500_000;

export interface SlabRow {
  label: string;
  ratePct: number;
  taxableInSlab: number;
  tax: number;
}

export interface Deductions {
  section80C: number;
  section80D: number;
  section80CCD1B: number;
  section24B: number;
  hraExemption: number;
  other: number;
}

export interface RegimeResult {
  regime: "new" | "old";
  grossIncome: number;
  totalDeductions: number;
  taxableIncome: number;
  slabs: SlabRow[];
  taxBeforeRebate: number;
  rebate: number;
  taxAfterRebate: number;
  cess: number;
  netTax: number;
  effectiveRatePct: number;
  monthlyTakeHome: number;
}

export interface TaxComparison {
  newRegime: RegimeResult;
  oldRegime: RegimeResult;
  recommended: "new" | "old";
  annualSaving: number;
  /** Extra old-regime deductions needed to match the new regime; 0 when the
   *  old regime already wins or no amount of deductions gets there. */
  breakEvenExtraDeductions: number;
}

export const EMPTY_DEDUCTIONS: Deductions = {
  section80C: 0,
  section80D: 0,
  section80CCD1B: 0,
  section24B: 0,
  hraExemption: 0,
  other: 0,
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function lakh(n: number) {
  return `₹${(n / 100_000).toLocaleString("en-IN", { maximumFractionDigits: 2 })}L`;
}

function bandLabel([lower, upper]: Band) {
  return upper === Infinity ? `Above ${lakh(lower)}` : `${lakh(lower)} – ${lakh(upper)}`;
}

function slabTax(taxable: number, bands: Band[]) {
  let total = 0;
  const slabs = bands.map((band) => {
    const [lower, upper, rate] = band;
    const inSlab = Math.max(0, Math.min(taxable, upper) - lower);
    const tax = round2((inSlab * rate) / 100);
    total += tax;
    return { label: bandLabel(band), ratePct: rate, taxableInSlab: round2(inSlab), tax };
  });
  return { slabs, total: round2(total) };
}

function finish(
  regime: "new" | "old",
  grossIncome: number,
  totalDeductions: number,
  taxableIncome: number,
  slabs: SlabRow[],
  taxBeforeRebate: number,
  taxAfterRebate: number,
): RegimeResult {
  const cess = round2(taxAfterRebate * CESS_RATE);
  const netTax = round2(taxAfterRebate + cess);
  return {
    regime,
    grossIncome,
    totalDeductions: round2(totalDeductions),
    taxableIncome: round2(taxableIncome),
    slabs,
    taxBeforeRebate,
    rebate: round2(taxBeforeRebate - taxAfterRebate),
    taxAfterRebate: round2(taxAfterRebate),
    cess,
    netTax,
    effectiveRatePct: grossIncome > 0 ? round2((netTax / grossIncome) * 100) : 0,
    monthlyTakeHome: round2((grossIncome - netTax) / 12),
  };
}

export function computeNewRegime(grossIncome: number): RegimeResult {
  const gross = Math.max(0, grossIncome);
  const deductions = Math.min(gross, NEW_REGIME_STD_DEDUCTION);
  const taxable = gross - deductions;
  const { slabs, total } = slabTax(taxable, NEW_REGIME_BANDS);

  let afterRebate = total;
  if (taxable <= NEW_REGIME_REBATE_CEILING) {
    afterRebate = 0;
  } else {
    // Marginal relief: crossing the ceiling by ₹X can't cost more than ₹X.
    afterRebate = Math.min(total, taxable - NEW_REGIME_REBATE_CEILING);
  }

  return finish("new", gross, deductions, taxable, slabs, total, afterRebate);
}

/** Caps each claimed deduction at its statutory limit. */
export function capDeductions(d: Deductions): Deductions {
  return {
    section80C: clampTo(d.section80C, LIMIT_80C),
    section80D: clampTo(d.section80D, LIMIT_80D),
    section80CCD1B: clampTo(d.section80CCD1B, LIMIT_80CCD_1B),
    section24B: clampTo(d.section24B, LIMIT_24B),
    hraExemption: Math.max(0, d.hraExemption),
    other: Math.max(0, d.other),
  };
}

function clampTo(value: number, limit: number) {
  return Math.min(limit, Math.max(0, value || 0));
}

export function computeOldRegime(grossIncome: number, claimed: Deductions): RegimeResult {
  const gross = Math.max(0, grossIncome);
  const d = capDeductions(claimed);
  const deductions = Math.min(
    gross,
    OLD_REGIME_STD_DEDUCTION +
      d.section80C +
      d.section80D +
      d.section80CCD1B +
      d.section24B +
      d.hraExemption +
      d.other,
  );
  const taxable = gross - deductions;
  const { slabs, total } = slabTax(taxable, OLD_REGIME_BANDS);
  const afterRebate = taxable <= OLD_REGIME_REBATE_CEILING ? 0 : total;

  return finish("old", gross, deductions, taxable, slabs, total, afterRebate);
}

export function compareRegimes(grossIncome: number, claimed: Deductions): TaxComparison {
  const newRegime = computeNewRegime(grossIncome);
  const oldRegime = computeOldRegime(grossIncome, claimed);

  // Ties go to the new regime: same tax, no paperwork.
  const recommended = oldRegime.netTax < newRegime.netTax ? "old" : "new";
  const annualSaving = round2(Math.abs(oldRegime.netTax - newRegime.netTax));

  let breakEvenExtraDeductions = 0;
  if (recommended === "new" && newRegime.netTax < oldRegime.netTax) {
    // Old-regime tax is monotone in deductions, so bisect on the extra amount
    // routed through "other". Capped at the whole taxable income.
    const capped = capDeductions(claimed);
    let low = 0;
    let high = oldRegime.taxableIncome;
    const at = (extra: number) =>
      computeOldRegime(grossIncome, { ...capped, other: capped.other + extra }).netTax;

    if (at(high) <= newRegime.netTax) {
      for (let i = 0; i < 40; i += 1) {
        const mid = (low + high) / 2;
        if (at(mid) <= newRegime.netTax) high = mid;
        else low = mid;
      }
      breakEvenExtraDeductions = Math.ceil(high);
    }
  }

  return { newRegime, oldRegime, recommended, annualSaving, breakEvenExtraDeductions };
}

/* ── Deduction hints from the ledger ─────────────────────────────────────── */

const DEDUCTION_PATTERNS: Array<{ key: keyof Deductions | "rent"; re: RegExp }> = [
  { key: "section80C", re: /\b(elss|sip|ppf|epf|vpf|lic|sukanya|ssy|nsc|tax ?saver|tuition|ulip)\b/i },
  {
    key: "section80D",
    re: /\b(health insurance|mediclaim|star health|care health|niva bupa|max bupa|hdfc ergo|icici lombard|tata aig)\b/i,
  },
  { key: "section80CCD1B", re: /\b(nps|national pension)\b/i },
  { key: "section24B", re: /\b(home loan interest|housing loan interest)\b/i },
  { key: "rent", re: /\b(rent|house rent)\b/i },
];

export interface DeductionHints {
  section80C: number;
  section80D: number;
  section80CCD1B: number;
  section24B: number;
  /** Rent paid. Not a deduction by itself — HRA exemption depends on salary
   *  structure the ledger doesn't know — so it's surfaced as a hint only. */
  rentPaid: number;
}

/**
 * Sums trailing-year expenses whose title or category name matches a
 * deduction keyword. Keyword matching is a suggestion, not a determination:
 * the UI pre-fills the inputs and the user corrects them.
 */
export function detectDeductionHints(
  expenses: Array<{ title: string; categoryName?: string | null; amount: number }>,
): DeductionHints {
  const totals: DeductionHints = {
    section80C: 0,
    section80D: 0,
    section80CCD1B: 0,
    section24B: 0,
    rentPaid: 0,
  };

  for (const expense of expenses) {
    const haystack = `${expense.title} ${expense.categoryName ?? ""}`;
    const match = DEDUCTION_PATTERNS.find(({ re }) => re.test(haystack));
    if (!match) continue;
    if (match.key === "rent") totals.rentPaid += expense.amount;
    else if (match.key in totals) totals[match.key as keyof DeductionHints] += expense.amount;
  }

  return {
    section80C: round2(Math.min(LIMIT_80C, totals.section80C)),
    section80D: round2(Math.min(LIMIT_80D, totals.section80D)),
    section80CCD1B: round2(Math.min(LIMIT_80CCD_1B, totals.section80CCD1B)),
    section24B: round2(Math.min(LIMIT_24B, totals.section24B)),
    rentPaid: round2(totals.rentPaid),
  };
}
