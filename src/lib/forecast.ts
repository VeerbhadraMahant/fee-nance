/**
 * Cash-flow projection.
 *
 * Pure — no Mongoose, no I/O, no clock of its own. Everything it needs is
 * passed in, which is what makes it the one piece of money logic in the
 * codebase that can be unit-tested today (backlog item T1).
 *
 * The projection has two components:
 *
 *   committed    — occurrences of recurring rules, stepped forward with the
 *                  same `getNextDate` the generator uses, so a projected date
 *                  always matches the date the runner will really create.
 *   discretionary — a flat daily rate derived from trailing spend with the
 *                  detected outliers removed, so one wedding doesn't set the
 *                  baseline for the next quarter.
 *
 * The band is ±1σ of monthly net, widened by √(days/30). Variance of a random
 * walk grows linearly with time, so its standard deviation grows with the
 * square root — a flat band would overstate confidence at day 90.
 */

import { toDateInput } from "@/lib/format";
import { roundCurrency } from "@/lib/money";
import { projectOccurrences, type RecurringFrequency } from "@/lib/recurrence";

export interface ForecastRule {
  title: string;
  type: "income" | "expense";
  amount: number;
  frequency: RecurringFrequency;
  nextRunAt: Date;
}

export interface ForecastInput {
  /** Net balance across all history up to and including `asOf`. */
  openingBalance: number;
  asOf: Date;
  horizonDays: number;
  rules: ForecastRule[];
  /** Mean daily spend outside the recurring rules, outliers excluded. */
  dailyDiscretionarySpend: number;
  /** Spread of monthly net over the trailing window; drives the band. */
  monthlyNetStdDev: number;
}

export interface ForecastPoint {
  date: string;
  /** Null before today — the actual series carries those days instead. */
  projected: number;
  lower: number;
  upper: number;
}

export interface ForecastResult {
  points: ForecastPoint[];
  committedIncome: number;
  committedExpense: number;
  discretionaryExpense: number;
  net30: number;
  closingBalance: number;
  /** First day the central projection goes negative, if any. */
  shortfallDate: string | null;
}

const DAY_MS = 86_400_000;

export function buildForecast({
  openingBalance,
  asOf,
  horizonDays,
  rules,
  dailyDiscretionarySpend,
  monthlyNetStdDev,
}: ForecastInput): ForecastResult {
  const horizonEnd = new Date(asOf.getTime() + horizonDays * DAY_MS);

  // Bucket every projected occurrence onto its calendar day so a day with two
  // rules landing on it moves the balance once, by the combined amount.
  const byDay = new Map<string, number>();
  let committedIncome = 0;
  let committedExpense = 0;

  for (const rule of rules) {
    const occurrences = projectOccurrences(
      rule.nextRunAt,
      rule.frequency,
      horizonEnd,
    );

    for (const occurrence of occurrences) {
      // An occurrence already due but not yet generated would otherwise land
      // in the past and never be counted. Pull it onto the first projected day.
      const day = toDateInput(
        occurrence.getTime() <= asOf.getTime()
          ? new Date(asOf.getTime() + DAY_MS)
          : occurrence,
      );

      const signed = rule.type === "income" ? rule.amount : -rule.amount;
      byDay.set(day, roundCurrency((byDay.get(day) ?? 0) + signed));

      if (rule.type === "income") {
        committedIncome = roundCurrency(committedIncome + rule.amount);
      } else {
        committedExpense = roundCurrency(committedExpense + rule.amount);
      }
    }
  }

  const points: ForecastPoint[] = [];
  let balance = openingBalance;
  let shortfallDate: string | null = null;
  let net30 = 0;

  for (let dayIndex = 1; dayIndex <= horizonDays; dayIndex += 1) {
    const date = new Date(asOf.getTime() + dayIndex * DAY_MS);
    const key = toDateInput(date);

    const movement = roundCurrency(
      (byDay.get(key) ?? 0) - dailyDiscretionarySpend,
    );
    balance = roundCurrency(balance + movement);

    if (dayIndex <= 30) {
      net30 = roundCurrency(net30 + movement);
    }

    if (shortfallDate === null && balance < 0) {
      shortfallDate = key;
    }

    const spread = roundCurrency(monthlyNetStdDev * Math.sqrt(dayIndex / 30));

    points.push({
      date: key,
      projected: balance,
      lower: roundCurrency(balance - spread),
      upper: roundCurrency(balance + spread),
    });
  }

  return {
    points,
    committedIncome,
    committedExpense,
    discretionaryExpense: roundCurrency(dailyDiscretionarySpend * horizonDays),
    net30,
    closingBalance: balance,
    shortfallDate,
  };
}

/** Sample standard deviation. Returns 0 below two samples — with one month of
 *  history there is no spread to report, and a fabricated band would read as
 *  confidence the data doesn't support. */
export function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);

  return roundCurrency(Math.sqrt(variance));
}
