/**
 * Financial health score, 0–100, as a weighted blend of five sub-scores.
 *
 * Ported from the HackMatrix (FinPilot) scorer and adapted to what this
 * ledger actually records. FinPilot's second pillar was debt pressure (DTI
 * and credit utilisation); Fee-Nance tracks no loans or credit limits, so
 * scoring it would mean inventing numbers. It is replaced by budget
 * adherence, which the ledger can measure, at the same weight.
 *
 *   Cash-flow stability   0.30   share of recent months that ended net-positive
 *   Budget adherence      0.25   how far inside their limits active budgets are
 *   Savings behaviour     0.20   trailing savings rate against a 20% target
 *   Emergency fund        0.15   balance in months of average spending, vs 6
 *   Spending consistency  0.10   month-to-month variation in spending
 *
 * Every formula is linear and clamped so a person can read the code and see
 * exactly why their number is what it is — that matters more here than
 * statistical sophistication.
 */

export interface SubScore {
  key: "cashFlow" | "budgets" | "savings" | "emergencyFund" | "consistency";
  name: string;
  score: number;
  weight: number;
  detail: string;
  /** False when the input was missing and a neutral default was used. */
  measured: boolean;
}

export interface HealthScore {
  overall: number;
  band: "strong" | "steady" | "fragile" | "at-risk";
  subScores: SubScore[];
}

export interface HealthInputs {
  /** Net (income − expense) per month, oldest first, completed months only. */
  monthlyNets: number[];
  /** Expense per month, oldest first, completed months only. */
  monthlyExpenses: number[];
  /** Income and expense over the trailing window used for the savings rate. */
  trailingIncome: number;
  trailingExpense: number;
  /** Current all-time balance. */
  balance: number;
  /** Utilisation (spent / limit) of each budget whose period includes today. */
  budgetUtilisation: number[];
}

const NEUTRAL = 70;

const clamp = (x: number, low = 0, high = 100) => Math.max(low, Math.min(high, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

function mean(values: number[]) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** Population coefficient of variation; 0 for fewer than two points. */
export function coefficientOfVariation(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  if (m === 0) return 0;
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.abs(Math.sqrt(variance) / m);
}

function cashFlow(monthlyNets: number[]): Omit<SubScore, "key" | "name" | "weight"> {
  if (monthlyNets.length < 2) {
    return { score: NEUTRAL, detail: "Not enough completed months yet", measured: false };
  }
  const positive = monthlyNets.filter((n) => n >= 0).length;
  // The latest month counts double: a fresh deficit is more actionable than
  // one from half a year ago.
  const latestPenalty = (monthlyNets.at(-1) ?? 0) < 0 ? 15 : 0;
  return {
    score: clamp((positive / monthlyNets.length) * 100 - latestPenalty),
    detail: `${positive} of the last ${monthlyNets.length} months ended in surplus`,
    measured: true,
  };
}

function budgets(utilisation: number[]): Omit<SubScore, "key" | "name" | "weight"> {
  if (!utilisation.length) {
    return { score: NEUTRAL, detail: "No active budgets to measure against", measured: false };
  }
  // Each budget scores 100 up to 80% used, falls to 50 at 100%, and to 0 at
  // 130%. Being near a limit is fine; blowing through it is not.
  const perBudget = utilisation.map((u) => {
    if (u <= 0.8) return 100;
    if (u <= 1) return 100 - ((u - 0.8) / 0.2) * 50;
    return clamp(50 - ((u - 1) / 0.3) * 50);
  });
  const over = utilisation.filter((u) => u > 1).length;
  return {
    score: clamp(mean(perBudget)),
    detail:
      over > 0
        ? `${over} of ${utilisation.length} active budgets over their limit`
        : `All ${utilisation.length} active budgets within their limit`,
    measured: true,
  };
}

function savings(income: number, expense: number): Omit<SubScore, "key" | "name" | "weight"> {
  if (income <= 0) {
    return {
      score: expense > 0 ? 0 : NEUTRAL,
      detail: expense > 0 ? "Spending with no recorded income" : "No income recorded yet",
      measured: expense > 0,
    };
  }
  const rate = (income - expense) / income;
  return {
    score: clamp((rate / 0.2) * 100),
    detail: `${Math.round(rate * 100)}% of income saved over the last 3 months`,
    measured: true,
  };
}

function emergency(balance: number, monthlyExpenses: number[]): Omit<SubScore, "key" | "name" | "weight"> {
  const avg = mean(monthlyExpenses.slice(-3));
  if (avg <= 0) {
    return { score: NEUTRAL, detail: "No spending history to size a buffer against", measured: false };
  }
  const months = Math.max(0, balance) / avg;
  return {
    score: clamp((months / 6) * 100),
    detail: `Balance covers ${months.toFixed(1)} months of average spending`,
    measured: true,
  };
}

function consistency(monthlyExpenses: number[]): Omit<SubScore, "key" | "name" | "weight"> {
  const active = monthlyExpenses.filter((v) => v > 0);
  if (active.length < 3) {
    return { score: NEUTRAL, detail: "Needs three months of spending", measured: false };
  }
  const cov = coefficientOfVariation(active);
  return {
    score: clamp(100 - cov * 100),
    detail: `Monthly spending varies by ${Math.round(cov * 100)}% around its average`,
    measured: true,
  };
}

const PILLARS: Array<{ key: SubScore["key"]; name: string; weight: number }> = [
  { key: "cashFlow", name: "Cash-flow stability", weight: 0.3 },
  { key: "budgets", name: "Budget adherence", weight: 0.25 },
  { key: "savings", name: "Savings behaviour", weight: 0.2 },
  { key: "emergencyFund", name: "Emergency fund", weight: 0.15 },
  { key: "consistency", name: "Spending consistency", weight: 0.1 },
];

export function computeHealthScore(input: HealthInputs): HealthScore {
  const results: Record<SubScore["key"], Omit<SubScore, "key" | "name" | "weight">> = {
    cashFlow: cashFlow(input.monthlyNets),
    budgets: budgets(input.budgetUtilisation),
    savings: savings(input.trailingIncome, input.trailingExpense),
    emergencyFund: emergency(input.balance, input.monthlyExpenses),
    consistency: consistency(input.monthlyExpenses),
  };

  const subScores = PILLARS.map((pillar) => ({
    ...pillar,
    ...results[pillar.key],
    score: round1(results[pillar.key].score),
  }));

  const overall = round1(clamp(subScores.reduce((s, p) => s + p.score * p.weight, 0)));
  const band =
    overall >= 80 ? "strong" : overall >= 60 ? "steady" : overall >= 40 ? "fragile" : "at-risk";

  return { overall, band, subScores };
}
