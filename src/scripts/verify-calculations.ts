/**
 * Checks the pure money modules — itemized split allocation, the cash-flow
 * forecast, the tax regimes, the health score, goal projection and recurring
 * detection — without touching the database.
 *
 * This is not a test suite. It is a standing check on the arithmetic that has
 * no other verification, run with `npm run verify:calc`. Backlog item T1
 * replaces it with Vitest; until then these are the assertions that would go
 * there, and they should keep passing.
 */

import { buildForecast, standardDeviation } from "../lib/forecast";
import { computeItemizedShares, computeShares } from "../lib/split";
import { projectOccurrences } from "../lib/recurrence";
import { compareRegimes, computeNewRegime, computeOldRegime, EMPTY_DEDUCTIONS } from "../lib/tax";
import { computeHealthScore } from "../lib/health-score";
import { projectGoal } from "../lib/goals";
import { detectRecurring } from "../lib/recurring-detect";

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

function expectThrow(name: string, run: () => unknown) {
  try {
    run();
    failures += 1;
    console.log(`  FAIL ${name} — did not throw`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  ok   ${name} → "${message}"`);
  }
}

function sumShares(shares: Array<{ shareAmount: number }>) {
  return Math.round(shares.reduce((acc, s) => acc + s.shareAmount, 0) * 100) / 100;
}

const members = ["a", "b", "c", "d"];

console.log("\nItemized split — allocation always sums to the total");
{
  const shares = computeItemizedShares(
    100,
    [{ label: "Pizza", amount: 100, sharedBy: ["a", "b", "c"] }],
    members,
  );
  check("₹100 across 3 sums exactly", sumShares(shares) === 100, `got ${sumShares(shares)}`);

  const manyItems = Array.from({ length: 7 }, (_, index) => ({
    label: `Item ${index + 1}`,
    amount: 10.01,
    sharedBy: ["a", "b", "c"],
  }));
  const manyTotal = 70.07;
  const manyShares = computeItemizedShares(manyTotal, manyItems, members);
  check(
    "7 indivisible items still sum exactly",
    sumShares(manyShares) === manyTotal,
    `got ${sumShares(manyShares)}`,
  );

  // Residuals rotate rather than always landing on the same member, so the
  // spread between the largest and smallest share stays at one paisa.
  const amounts = manyShares.map((s) => s.shareAmount);
  check(
    "residual paise are spread, not stacked on one member",
    Math.max(...amounts) - Math.min(...amounts) <= 0.01 + 1e-9,
    `spread ${(Math.max(...amounts) - Math.min(...amounts)).toFixed(2)}`,
  );

  const bill = computeItemizedShares(
    1247.5,
    [
      { label: "Paneer Tikka", amount: 320, sharedBy: ["a", "b"] },
      { label: "Biryani", amount: 450, sharedBy: ["c"] },
      { label: "Naan basket", amount: 180, sharedBy: ["a", "b", "c", "d"] },
      { label: "Desserts", amount: 297.5, sharedBy: ["b", "d", "a"] },
    ],
    members,
  );
  check("realistic bill sums exactly", sumShares(bill) === 1247.5, `got ${sumShares(bill)}`);
  check(
    "a solo item is charged in full to one person",
    bill.find((s) => s.userId === "c")?.shareAmount === 495,
  );
}

console.log("\nItemized split — proportional tax");
{
  const shares = computeItemizedShares(
    1050,
    [
      { label: "Main A", amount: 900, sharedBy: ["a"] },
      { label: "Main B", amount: 100, sharedBy: ["b"] },
      { label: "GST", amount: 50, sharedBy: ["a", "b"], proportional: true },
    ],
    members,
  );
  check("sums exactly", sumShares(shares) === 1050, `got ${sumShares(shares)}`);
  check(
    "tax follows the subtotal rather than splitting evenly",
    shares.find((s) => s.userId === "a")?.shareAmount === 945 &&
      shares.find((s) => s.userId === "b")?.shareAmount === 105,
  );
}

console.log("\nItemized split — determinism");
{
  const one = computeItemizedShares(10, [{ label: "X", amount: 10, sharedBy: ["a", "b", "c"] }], members);
  const two = computeItemizedShares(10, [{ label: "X", amount: 10, sharedBy: ["c", "b", "a"] }], members);
  check("input order does not change the result", JSON.stringify(one) === JSON.stringify(two));
}

console.log("\nItemized split — rejections");
{
  expectThrow("member outside the group", () =>
    computeItemizedShares(100, [{ label: "X", amount: 100, sharedBy: ["zz"] }], members),
  );
  expectThrow("item assigned to nobody", () =>
    computeItemizedShares(100, [{ label: "X", amount: 100, sharedBy: [] }], members),
  );
  expectThrow("items do not sum to the stated total", () =>
    computeItemizedShares(999, [{ label: "X", amount: 100, sharedBy: ["a"] }], members),
  );
  expectThrow("no line items at all", () => computeItemizedShares(100, [], members));
  expectThrow("tax with nothing to spread across", () =>
    computeItemizedShares(50, [{ label: "GST", amount: 50, sharedBy: ["a"], proportional: true }], members),
  );
  expectThrow("same member twice on one item", () =>
    computeItemizedShares(100, [{ label: "X", amount: 100, sharedBy: ["a", "a"] }], members),
  );
}

console.log("\nSplit strategy dispatch");
{
  const itemized = computeShares(100, "itemized", [], members, [
    { label: "X", amount: 100, sharedBy: ["a", "b", "c"] },
  ]);
  check("itemized branch reachable through computeShares", sumShares(itemized) === 100);
  check("equal split unaffected", sumShares(computeShares(100, "equal", [], members)) === 100);
}

console.log("\nRecurrence projection");
{
  const start = new Date(2026, 0, 15);
  const monthly = projectOccurrences(start, "monthly", new Date(2026, 5, 20));
  check("monthly steps land on the same day each month", monthly.length === 6, `got ${monthly.length}`);
  check("first occurrence is the one not yet generated", monthly[0].getTime() === start.getTime());

  // 2026-01-15, 2027-01-15, 2028-01-15 — the 2029 occurrence falls after the
  // cutoff, so the horizon end is exclusive of it.
  const yearly = projectOccurrences(start, "yearly", new Date(2029, 0, 1));
  check("yearly steps stop at the horizon", yearly.length === 3, `got ${yearly.length}`);

  const runaway = projectOccurrences(new Date(1990, 0, 1), "monthly", new Date(2030, 0, 1));
  check("a stale rule cannot spin forever", runaway.length <= 240, `got ${runaway.length}`);
}

console.log("\nForecast");
{
  const asOf = new Date(2026, 0, 1);
  const result = buildForecast({
    openingBalance: 50_000,
    asOf,
    horizonDays: 90,
    rules: [
      { title: "Salary", type: "income", amount: 85_000, frequency: "monthly", nextRunAt: new Date(2026, 0, 5) },
      { title: "Rent", type: "expense", amount: 28_000, frequency: "monthly", nextRunAt: new Date(2026, 0, 3) },
    ],
    dailyDiscretionarySpend: 500,
    monthlyNetStdDev: 12_000,
  });

  check("one point per day of the horizon", result.points.length === 90, `got ${result.points.length}`);
  check("income and expense both projected", result.committedIncome > 0 && result.committedExpense > 0);
  check(
    "closing balance matches the last point",
    result.closingBalance === result.points.at(-1)?.projected,
  );

  // 3 salaries − 3 rents − 90 days of ₹500 = +126,000 on a 50,000 opening.
  check(
    "arithmetic adds up",
    Math.abs(result.closingBalance - (50_000 + 3 * 85_000 - 3 * 28_000 - 90 * 500)) < 1,
    `got ${result.closingBalance}`,
  );

  check("band widens with time", (result.points[89].upper - result.points[89].projected) >
    (result.points[0].upper - result.points[0].projected));
  check("no shortfall on a healthy ledger", result.shortfallDate === null);

  const broke = buildForecast({
    openingBalance: 1_000,
    asOf,
    horizonDays: 90,
    rules: [],
    dailyDiscretionarySpend: 500,
    monthlyNetStdDev: 0,
  });
  check("shortfall detected when the balance runs out", broke.shortfallDate !== null);
  check("shortfall lands on day 3", broke.shortfallDate === broke.points[2].date, `got ${broke.shortfallDate}`);

  check("stdDev of a single sample is 0, not NaN", standardDeviation([5]) === 0);
  check("stdDev is computed", standardDeviation([10, 20, 30]) === 10);
}

console.log("\nTax — new regime slabs, rebate and marginal relief (FY 2026-27)");
{
  check("₹12.75L salary pays nothing (rebate up to ₹12L taxable)", computeNewRegime(1_275_000).netTax === 0);
  const justOver = computeNewRegime(1_300_000);
  check(
    "₹13L: marginal relief caps tax at the excess over ₹12L, plus cess",
    justOver.netTax === 26_000,
    `got ${justOver.netTax}`,
  );
  const high = computeNewRegime(2_075_000);
  check("₹20.75L: slab tax ₹2,00,000 + 4% cess", high.netTax === 208_000, `got ${high.netTax}`);
  check(
    "slab rows add up to the pre-rebate tax",
    high.slabs.reduce((s, r) => s + r.tax, 0) === high.taxBeforeRebate,
  );
}

console.log("\nTax — old regime and comparison");
{
  const old = computeOldRegime(1_000_000, { ...EMPTY_DEDUCTIONS, section80C: 150_000 });
  check("₹10L with full 80C: ₹75,400", old.netTax === 75_400, `got ${old.netTax}`);
  const capped = computeOldRegime(1_000_000, { ...EMPTY_DEDUCTIONS, section80C: 900_000 });
  check("80C is capped at ₹1.5L", capped.netTax === old.netTax, `got ${capped.netTax}`);
  check("₹5L taxable is fully rebated", computeOldRegime(550_000, EMPTY_DEDUCTIONS).netTax === 0);

  const cmp = compareRegimes(1_500_000, EMPTY_DEDUCTIONS);
  check("no deductions → new regime wins", cmp.recommended === "new");
  check("break-even is positive when new regime wins", cmp.breakEvenExtraDeductions > 0);
  const atBreakEven = computeOldRegime(1_500_000, {
    ...EMPTY_DEDUCTIONS,
    other: cmp.breakEvenExtraDeductions,
  });
  check(
    "claiming the break-even amount matches the new regime",
    atBreakEven.netTax <= cmp.newRegime.netTax,
    `old ${atBreakEven.netTax} vs new ${cmp.newRegime.netTax}`,
  );
}

console.log("\nHealth score");
{
  const healthy = computeHealthScore({
    monthlyNets: [20_000, 18_000, 22_000, 19_000, 21_000, 20_000],
    monthlyExpenses: [60_000, 62_000, 58_000, 61_000, 59_000, 60_000],
    trailingIncome: 240_000,
    trailingExpense: 180_000,
    balance: 400_000,
    budgetUtilisation: [0.6, 0.75],
  });
  check("healthy ledger scores strong", healthy.band === "strong", `got ${healthy.overall}`);
  check("weights sum to 1", Math.abs(healthy.subScores.reduce((s, p) => s + p.weight, 0) - 1) < 1e-9);

  const empty = computeHealthScore({
    monthlyNets: [],
    monthlyExpenses: [],
    trailingIncome: 0,
    trailingExpense: 0,
    balance: 0,
    budgetUtilisation: [],
  });
  check("empty ledger is neutral, not zero", empty.overall === 70, `got ${empty.overall}`);
  check("empty ledger marks nothing as measured", empty.subScores.every((p) => !p.measured));

  const overBudget = computeHealthScore({
    monthlyNets: [-5_000, -2_000],
    monthlyExpenses: [50_000, 52_000],
    trailingIncome: 95_000,
    trailingExpense: 102_000,
    balance: 1_000,
    budgetUtilisation: [1.4],
  });
  check("overspending ledger is at risk", overBudget.band === "at-risk", `got ${overBudget.overall}`);
}

console.log("\nGoal projection");
{
  const today = new Date(2026, 0, 15);
  const p = projectGoal({ targetAmount: 100_000, savedAmount: 40_000, targetDate: new Date(2026, 6, 15) }, 10_000, today);
  check("6 months to go at ₹10k/month", p.monthsToGo === 6, `got ${p.monthsToGo}`);
  check("on track for a date 6 months out", p.onTrack);
  check("required monthly is ₹10,000", p.requiredMonthly === 10_000, `got ${p.requiredMonthly}`);

  const stalled = projectGoal({ targetAmount: 100_000, savedAmount: 0 }, 0, today);
  check("no contribution → never finishes", stalled.monthsToGo === null && !stalled.onTrack);
  check("met goal is complete", projectGoal({ targetAmount: 10, savedAmount: 10 }, 0, today).complete);
}

console.log("\nRecurring detection");
{
  const day = (d: number) => new Date(2026, 0, 1 + d);
  const charge = (id: string, title: string, amount: number, d: number) => ({
    id,
    title,
    amount,
    date: day(d),
    categoryName: "Subscriptions",
  });
  const found = detectRecurring([
    charge("1", "NETFLIX 4482", 649, 0),
    charge("2", "Netflix 9911", 649, 31),
    charge("3", "netflix", 649, 59),
    charge("4", "Netflix", 649, 90),
    charge("5", "Spotify", 119, 3),
    charge("6", "Spotify", 119, 34),
    charge("7", "Spotify", 119, 62),
    charge("8", "Hotstar", 299, 5),
    charge("9", "Hotstar", 299, 36),
    charge("10", "Hotstar", 299, 64),
    charge("11", "Cafe", 180, 1),
    charge("12", "Cafe", 640, 4),
    charge("13", "Cafe", 90, 19),
  ]);
  const netflix = found.find((f) => f.key === "netflix");
  check("reference numbers are normalised away", Boolean(netflix) && netflix!.occurrences === 4);
  check("classified as monthly", netflix?.frequency === "monthly");
  check("irregular payee is not flagged", !found.some((f) => f.key === "cafe"));
  check("two video services flagged as overlapping", netflix?.overlapGroup === "Video streaming");
  check(
    "a lone music service is not flagged",
    found.find((f) => f.key === "spotify")?.overlapGroup === null,
  );
}

console.log(
  failures === 0
    ? "\nAll calculation checks passed.\n"
    : `\n${failures} FAILURE(S)\n`,
);

process.exit(failures === 0 ? 0 : 1);
