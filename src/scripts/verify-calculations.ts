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
import { firstRunAfter, getNextDate, projectOccurrences } from "../lib/recurrence";
import { compareRegimes, computeNewRegime, computeOldRegime, EMPTY_DEDUCTIONS } from "../lib/tax";
import { computeHealthScore } from "../lib/health-score";
import { projectGoal } from "../lib/goals";
import { detectRecurring } from "../lib/recurring-detect";
import { DbQueryError, handleRouteError, HttpError } from "../lib/route";
import { safeNextPath } from "../lib/safe-redirect";
import {
  duplicateKey,
  guessMapping,
  normaliseRows,
  parseAmount,
  parseCsv,
  parseStatementDate,
} from "../lib/csv-import";
import { upiPayLink, isValidUpiId } from "../lib/upi";
import {
  classify,
  describe,
  interpret,
  makeRepeatable,
  overlayTransactions,
  runSync,
  type OverlayTransaction,
  type QueueItem,
} from "../lib/offline/rules";
import { budgetPace } from "../lib/budget-pace";
import { buildSampleData } from "../lib/sample-data";

let failures = 0;
/** Checks that need to await; the summary waits for them. */
const asyncChecks: Array<Promise<void>> = [];

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

console.log("\nEqual and percentage splits — paise, largest remainder");
{
  const everyone = computeShares(100, "equal", [], members);
  check("no participants listed means the whole group", everyone.length === 4);

  const three = computeShares(100, "equal", [{ userId: "a" }, { userId: "c" }, { userId: "d" }], members);
  check("listed participants only", three.length === 3 && !three.some((s) => s.userId === "b"));
  check("₹100 across 3 sums exactly", sumShares(three) === 100, `got ${sumShares(three)}`);
  const amounts = three.map((s) => s.shareAmount).sort();
  check("the spare paisa goes to one person", JSON.stringify(amounts) === JSON.stringify([33.33, 33.33, 33.34]),
    JSON.stringify(amounts));

  for (let n = 2; n <= 12; n += 1) {
    const ids = Array.from({ length: n }, (_, i) => `m${String(i).padStart(2, "0")}`);
    for (const total of [(n + 1) / 100, 99.99, 1000.07, 12345.67]) {
      const shares = computeShares(total, "equal", [], ids);
      if (sumShares(shares) !== total) {
        check(`equal ₹${total} across ${n} sums exactly`, false, `got ${sumShares(shares)}`);
      }
    }
  }
  check("equal splits sum exactly for 2–12 members and awkward totals", true);

  expectThrow("participant outside the group", () =>
    computeShares(100, "equal", [{ userId: "zz" }], members),
  );

  const pct = computeShares(100.01, "percentage", [
    { userId: "a", percentage: 33.33 },
    { userId: "b", percentage: 33.33 },
    { userId: "c", percentage: 33.34 },
  ], members);
  check("repeating percentages allocate instead of missing a paisa", sumShares(pct) === 100.01,
    `got ${sumShares(pct)}`);
  expectThrow("percentages must total 100", () =>
    computeShares(100, "percentage", [{ userId: "a", percentage: 60 }, { userId: "b", percentage: 30 }], members),
  );
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

  // Dates are stored as UTC midnight of the chosen day.
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const monthEnd = projectOccurrences(new Date("2026-01-31T00:00:00Z"), "monthly", new Date("2026-05-31T00:00:00Z"));
  check("a rule on the 31st stays at month-end",
    monthEnd.map(day).join() === "2026-01-31,2026-02-28,2026-03-31,2026-04-30,2026-05-31",
    monthEnd.map(day).join());

  // Stepping from an already clamped date needs the anchor, as the runner does.
  const fromFeb = getNextDate(new Date("2026-02-28T00:00:00Z"), "monthly", 31);
  check("the anchor day survives a clamped month", day(fromFeb) === "2026-03-31", day(fromFeb));

  const leap = projectOccurrences(new Date("2028-02-29T00:00:00Z"), "yearly", new Date("2033-01-01T00:00:00Z"));
  check("29 Feb falls back to 28 Feb, then returns in leap years",
    leap.map(day).join() === "2028-02-29,2029-02-28,2030-02-28,2031-02-28,2032-02-29", leap.map(day).join());

  const ruleDate = new Date("2026-03-05T00:00:00Z");
  check("first run is a period after the rule itself",
    day(firstRunAfter(ruleDate, "monthly")) === "2026-04-05");
  check("a requested first run on the rule's own date is pushed forward",
    day(firstRunAfter(ruleDate, "monthly", ruleDate)) === "2026-04-05");
  check("a later requested first run is kept",
    day(firstRunAfter(ruleDate, "yearly", new Date("2026-06-01T00:00:00Z"))) === "2026-06-01");
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

  const awkward = projectGoal(
    { targetAmount: 260_000, savedAmount: 42_000, targetDate: new Date(2026, 5, 1) },
    0,
    new Date(2025, 9, 8),
  );
  const atRequired = projectGoal(
    { targetAmount: 260_000, savedAmount: 42_000, targetDate: new Date(2026, 5, 1) },
    awkward.requiredMonthly!,
    new Date(2025, 9, 8),
  );
  check("paying the required monthly lands on time, even mid-month", atRequired.onTrack,
    `required ${awkward.requiredMonthly}, done ${atRequired.projectedDate?.toDateString()}`);

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

console.log("\nRoute error mapping (database errors → HTTP)");
{
  const status = (error: unknown) => handleRouteError(error, "boom").status;
  check("UNAUTHORIZED → 401", status(new Error("UNAUTHORIZED")) === 401);
  check("HttpError keeps its status", status(new HttpError(422, "Category not found")) === 422);
  check("unique violation → 409", status(new DbQueryError({ code: "23505", message: "dup" })) === 409);
  check("malformed uuid → 404", status(new DbQueryError({ code: "22P02", message: "bad uuid" })) === 404);
  check("invalid invite code → 404", status(new DbQueryError({ code: "P0001", message: "invalid_invite_code" })) === 404);
  check("group_not_found → 404", status(new DbQueryError({ code: "P0001", message: "group_not_found" })) === 404);
  check("other raised message → 422", status(new DbQueryError({ code: "P0001", message: "Payer amounts must add up" })) === 422);
  check("check violation → 422", status(new DbQueryError({ code: "23514", message: "check" })) === 422);
  console.log("  (the JSON error line below is the expected log for an unmapped error)");
  check("anything else → 500", status(new DbQueryError({ code: "08006", message: "connection" })) === 500);
}

console.log("\nPost-login redirect guard");
{
  check("relative path kept", safeNextPath("/groups/abc?x=1") === "/groups/abc?x=1");
  check("absolute URL rejected", safeNextPath("https://evil.com") === "/dashboard");
  check("protocol-relative rejected", safeNextPath("//evil.com") === "/dashboard");
  check("backslash trick rejected", safeNextPath("/\\evil.com") === "/dashboard");
  check("missing → fallback", safeNextPath(null) === "/dashboard");
}

console.log("\nStatement import");
{
  check("day-first slash dates", parseStatementDate("03/04/2026") === "2026-04-03");
  check("ISO dates", parseStatementDate("2026-04-03") === "2026-04-03");
  check("dd-Mon-yyyy", parseStatementDate("3-Apr-2026") === "2026-04-03");
  check("dd Month yy", parseStatementDate("03 April 26") === "2026-04-03");
  check("a time of day is ignored", parseStatementDate("03/04/2026 14:32:10") === "2026-04-03");
  check("31 Feb is rejected", parseStatementDate("31/02/2026") === null);
  check("garbage is rejected", parseStatementDate("yesterday") === null);

  check("lakh separators and rupee sign", parseAmount("₹ 1,23,456.50") === 123456.5);
  check("parentheses mean money out", parseAmount("(450.00)") === -450);
  check("Dr suffix means money out", parseAmount("450.00 Dr") === -450);
  check("Cr suffix means money in", parseAmount("450.00 Cr") === 450);
  check("a leading minus", parseAmount("-1,200") === -1200);
  check("blank and text are not numbers", parseAmount("") === null && parseAmount("n/a") === null);

  const table = parseCsv(
    [
      "Date,Narration,Withdrawal Amt.,Deposit Amt.,Balance",
      '03/04/2026,"UPI-SWIGGY, BLR",486.00,,10000',
      "04/04/2026,SALARY APR,,92000.00,102000",
      "05/04/2026,,10,,0",
      "xx,BAD DATE,10,,0",
    ].join("\r\n"),
  );
  check("quoted commas stay inside the field", table[1][1] === "UPI-SWIGGY, BLR", table[1][1]);
  const mapping = guessMapping(table[0]);
  check(
    "headers are recognised",
    mapping.date === 0 && mapping.title === 1 && mapping.debit === 2 && mapping.credit === 3,
    JSON.stringify(mapping),
  );
  const { rows, problems } = normaliseRows(table.slice(1), mapping);
  check(
    "debit and credit columns give expense and income",
    rows.length === 2 &&
      rows[0].type === "expense" &&
      rows[0].amount === 486 &&
      rows[1].type === "income" &&
      rows[1].amount === 92000,
    JSON.stringify(rows),
  );
  check(
    "unreadable rows are reported with their line, not guessed",
    problems.length === 2 && problems[0].line === 4 && problems[1].line === 5,
    JSON.stringify(problems),
  );

  const semicolons = parseCsv("Date;Description;Amount\n03/04/2026;Chai;-40\n");
  check("semicolon-separated files", semicolons[1][2] === "-40");
  const signed = normaliseRows(semicolons.slice(1), guessMapping(semicolons[0]));
  check("a signed amount column", signed.rows[0]?.type === "expense" && signed.rows[0].amount === 40);

  check(
    "duplicate key ignores case and spacing",
    duplicateKey({ date: "2026-04-03", amount: 40, type: "expense", title: "Chai " }) ===
      duplicateKey({ date: "2026-04-03", amount: 40, type: "expense", title: "CHAI" }),
  );
}

console.log("\nUPI links");
{
  check("valid UPI ids", isValidUpiId("alice.rao@okaxis") && isValidUpiId("9876543210@ybl"));
  check("invalid UPI ids", !isValidUpiId("not a upi id") && !isValidUpiId("a@") && !isValidUpiId("@bank"));
  const link = upiPayLink({ upiId: "alice@okaxis", payeeName: "Alice Rao", amount: 600, note: "Fee-Nance: Goa trip" });
  check(
    "link carries payee, amount, currency and note",
    link === "upi://pay?pa=alice%40okaxis&pn=Alice%20Rao&am=600.00&cu=INR&tn=Fee-Nance%3A%20Goa%20trip",
    link,
  );
}

console.log("\nBudget pacing");
{
  const budget = {
    _id: "b",
    name: "Food",
    amount: 10000,
    cycle: "monthly" as const,
    currency: "INR" as const,
    periodStart: "2026-06-01T00:00:00.000Z",
    periodEnd: "2026-06-30T23:59:59.000Z",
  };
  const midMonth = Date.parse("2026-06-15T12:00:00.000Z");
  const hot = budgetPace(budget, 8000, midMonth);
  check("80% spent at mid-month projects well over budget", hot?.willExceed === true && hot.projected > 15000, JSON.stringify(hot));
  const calm = budgetPace(budget, 4800, midMonth);
  check("48% spent at mid-month is on pace", calm?.willExceed === false && Math.abs(calm.aheadBy) < 5, JSON.stringify(calm));
  check("no pace before the period starts", budgetPace(budget, 100, Date.parse("2026-05-20T00:00:00.000Z")) === null);
  check("no pace after it ends", budgetPace(budget, 100, Date.parse("2026-07-02T00:00:00.000Z")) === null);
  check(
    "no pace in the first hours, when one purchase swings it",
    budgetPace(budget, 500, Date.parse("2026-06-01T06:00:00.000Z")) === null,
  );
}

console.log("\nOffline queue rules");
{
  const T = "11111111-1111-4111-8111-111111111111";
  const G = "22222222-2222-4222-8222-222222222222";

  check("create transaction is queueable", classify("POST", "/api/private/transactions")?.op === "create");
  check("edit and delete a transaction are queueable",
    classify("PATCH", `/api/private/transactions/${T}`)?.targetId === T &&
      classify("DELETE", `/api/private/transactions/${T}`)?.op === "delete");
  check("add a group expense and record a settlement are queueable",
    classify("POST", `/api/private/groups/${G}/expenses`)?.kind === "expense" &&
      classify("POST", `/api/private/groups/${G}/settlements`)?.kind === "settlement");
  check("leaving a group is not queueable", classify("DELETE", `/api/private/groups/${G}`) === null);
  check("editing a group expense is not queueable", classify("PATCH", `/api/private/groups/${G}/expenses/${T}`) === null);
  check("budgets, goals and profile are not queueable",
    classify("POST", "/api/private/budgets") === null && classify("POST", "/api/private/goals") === null &&
      classify("PATCH", "/api/private/me") === null);
  check("recurring generation and import are not queueable",
    classify("POST", "/api/private/transactions/recurring/run") === null &&
      classify("POST", "/api/private/transactions/import") === null);
  check("a malformed id is not queueable", classify("DELETE", "/api/private/transactions/nope") === null);

  let n = 0;
  const key = () => `k${(n += 1)}`;
  const txn = makeRepeatable({ kind: "transaction", op: "create" }, '{"title":"Chai","amount":20}', {}, () => "22222222-2222-4222-8222-22222222222" + n++);
  check("a new transaction gets the id it will keep", JSON.parse(txn.body!).id === txn.targetId && Boolean(txn.targetId));
  const again = makeRepeatable({ kind: "transaction", op: "create" }, txn.body, {}, key);
  check("a transaction that already has an id keeps it", again.targetId === txn.targetId);
  const exp = makeRepeatable({ kind: "expense", op: "create" }, '{"title":"Dinner"}', {}, key);
  check("an expense gets a client key", /^exp-/.test(JSON.parse(exp.body!).clientKey));
  const set = makeRepeatable({ kind: "settlement", op: "create" }, '{"amount":5}', {}, key);
  check("a settlement gets an idempotency header", /^set-/.test(set.headers["x-idempotency-key"]));
  const kept = makeRepeatable({ kind: "settlement", op: "create" }, "{}", { "x-idempotency-key": "mine-12345" }, key);
  check("an existing idempotency header is kept", kept.headers["x-idempotency-key"] === "mine-12345");

  check("2xx is done", interpret({ kind: "expense", op: "create" }, 201) === "done");
  check("a repeated transaction create (409) is done", interpret({ kind: "transaction", op: "create" }, 409) === "done");
  check("a repeated delete (404) is done", interpret({ kind: "transaction", op: "delete" }, 404) === "done");
  check("an edit of something that's gone (404) is a conflict", interpret({ kind: "transaction", op: "update" }, 404) === "conflict");
  check("a rejected expense (422) is a conflict", interpret({ kind: "expense", op: "create" }, 422) === "conflict");
  check("401 means sign in again", interpret({ kind: "expense", op: "create" }, 401) === "auth");
  check("5xx and 429 are retried", interpret({ kind: "expense", op: "create" }, 503) === "retry" && interpret({ kind: "expense", op: "create" }, 429) === "retry");

  check("describe: add a transaction", describe("transaction", "create", '{"title":"Chai","amount":20}') === 'Add "Chai" ₹20');
  check("describe: group expense", describe("expense", "create", '{"title":"Dinner","amount":1200}') === 'Add group expense "Dinner" ₹1,200');
}

console.log("\nOffline sync run");
{
  const mk = (order: number, over: Partial<QueueItem>): QueueItem => ({
    id: `i${order}`, userId: "u", order, createdAt: "2026-06-01T00:00:00Z", kind: "transaction", op: "create",
    method: "POST", url: "/api/private/transactions", body: "{}", headers: {}, targetId: `t${order}`,
    label: "x", status: "pending", attempts: 0, ...over,
  });
  const world = (initial: QueueItem[], respond: (item: QueueItem) => number | "offline") => {
    const store = new Map(initial.map((i) => [i.id, i]));
    const sent: string[] = [];
    return {
      store,
      sent,
      deps: {
        load: async () => [...store.values()],
        save: async (i: QueueItem) => void store.set(i.id, i),
        remove: async (id: string) => void store.delete(id),
        send: async (i: QueueItem) => {
          sent.push(i.id);
          const r = respond(i);
          if (r === "offline") throw new TypeError("network");
          return { status: r };
        },
      },
    };
  };

  // Nothing queued: no requests at all.
  asyncChecks.push((async () => {
    const empty = world([], () => 200);
    const r0 = await runSync(empty.deps);
    check("an empty queue makes no requests", empty.sent.length === 0 && r0.synced === 0);

    const happy = world([mk(2, {}), mk(1, {}), mk(3, {})], () => 201);
    const r1 = await runSync(happy.deps);
    check("replays in order and empties the queue", happy.sent.join() === "i1,i2,i3" && happy.store.size === 0 && r1.synced === 3);

    const flaky = world([mk(1, {}), mk(2, {}), mk(3, {})], (i) => (i.id === "i2" ? "offline" : 201));
    const r2 = await runSync(flaky.deps);
    check("stops when the connection drops and keeps the rest",
      r2.offline && r2.synced === 1 && flaky.store.size === 2 && flaky.sent.join() === "i1,i2" && flaky.store.get("i2")!.attempts === 0);
    const r2b = await runSync({ ...flaky.deps, send: async (i) => { flaky.sent.push(i.id); return { status: 201 }; } });
    check("the next run finishes the job", r2b.synced === 2 && flaky.store.size === 0);

    const rejected = world([mk(1, {}), mk(2, {}), mk(3, {})], (i) => (i.id === "i2" ? 422 : 201));
    const r3 = await runSync(rejected.deps);
    check("a rejected change is marked failed and the rest still sync",
      r3.synced === 2 && r3.failed === 1 && rejected.store.get("i2")!.status === "failed" && rejected.store.size === 1);
    const r3b = await runSync(rejected.deps);
    check("a failed change is not retried", r3b.synced === 0 && rejected.sent.filter((s) => s === "i2").length === 1);

    const dep = world(
      [mk(1, { targetId: "T" }), mk(2, { op: "update", method: "PATCH", targetId: "T", url: "/api/private/transactions/T" })],
      (i) => (i.id === "i1" ? 422 : 200),
    );
    const r4 = await runSync(dep.deps);
    check("an edit of a transaction that failed to create is failed without being sent",
      r4.failed === 2 && dep.sent.join() === "i1" && dep.store.get("i2")!.status === "failed");

    const lost = world([mk(1, {})], () => 409);
    const r5 = await runSync(lost.deps);
    check("a create the server already has (lost response) counts as synced", r5.synced === 1 && lost.store.size === 0);

    const expired = world([mk(1, {}), mk(2, {})], () => 401);
    const r6 = await runSync(expired.deps);
    check("an expired session stops the run and keeps everything",
      r6.authRequired && r6.synced === 0 && expired.store.size === 2 && expired.sent.length === 1);
  })());
}

console.log("\nPending changes over a transaction list");
{
  const base = (id: string, date: string, amount = 100): OverlayTransaction => ({
    _id: id, type: "expense", title: id, amount, transactionDate: date, currency: "INR",
  });
  const list = [base("a", "2026-06-10T00:00:00.000Z"), base("b", "2026-06-05T00:00:00.000Z")];
  const item = (order: number, over: Partial<QueueItem>): QueueItem => ({
    id: `q${order}`, userId: "u", order, createdAt: "", kind: "transaction", op: "create", method: "POST",
    url: "", body: "{}", headers: {}, label: "", status: "pending", attempts: 0, ...over,
  });

  const added = overlayTransactions(list, [
    item(1, { targetId: "n", body: '{"type":"expense","title":"Chai","amount":20,"transactionDate":"2026-06-12T00:00:00.000Z"}' }),
  ]);
  check("an offline entry appears, first, marked pending",
    added.length === 3 && added[0]._id === "n" && added[0].pending === true && added[0].amount === 20);

  const outside = overlayTransactions(list, [
    item(1, { targetId: "n", body: '{"title":"Old","amount":5,"transactionDate":"2025-01-01T00:00:00.000Z"}' }),
  ], { startDate: "2026-06-01T00:00:00.000Z", endDate: "2026-06-30T23:59:59.000Z" });
  check("an entry outside the viewed range is left out", outside.length === 2);

  const edited = overlayTransactions(list, [item(1, { op: "update", method: "PATCH", targetId: "a", body: '{"amount":250,"title":"Renamed"}' })]);
  check("an offline edit changes the entry and marks it pending",
    edited.find((t) => t._id === "a")!.amount === 250 && edited.find((t) => t._id === "a")!.title === "Renamed" && edited.find((t) => t._id === "a")!.pending === true);

  const deleted = overlayTransactions(list, [item(1, { op: "delete", method: "DELETE", targetId: "b", body: null })]);
  check("an offline delete hides the entry", deleted.length === 1 && deleted[0]._id === "a");

  const chain = overlayTransactions(list, [
    item(1, { targetId: "n", body: '{"title":"Chai","amount":20,"transactionDate":"2026-06-12T00:00:00.000Z"}' }),
    item(2, { op: "update", method: "PATCH", targetId: "n", body: '{"amount":30}' }),
    item(3, { op: "delete", method: "DELETE", targetId: "a", body: null }),
  ]);
  check("create, edit and delete apply in order", chain.length === 2 && chain[0].amount === 30);
  check("failed items are not shown",
    overlayTransactions(list, [item(1, { status: "failed", targetId: "n", body: '{"title":"x","amount":1}' })]).length === 2);
  check("the input list is not mutated", list.length === 2 && list[0].pending === undefined);
}


console.log("\nSample data for the tour");
{
  const now = new Date(2026, 10, 18, 15);
  const s = buildSampleData(now);
  const systemNames = ["Salary", "Freelance", "Food", "Rent", "Travel", "Shopping", "Utilities"];
  check("nothing is dated in the future", s.transactions.every((t) => new Date(t.transaction_date).getTime() <= now.getTime()));
  check("every category is one of the system categories",
    s.transactions.every((t) => t.category === null || systemNames.includes(t.category)) &&
    s.budgets.every((b) => b.category === null || systemNames.includes(b.category)));
  check("amounts are positive and titles fit the column",
    s.transactions.every((t) => t.amount > 0 && t.title.length >= 1 && t.title.length <= 100));
  const swiggy = s.transactions.filter((t) => t.title === "Swiggy order");
  check("includes a double charge for the duplicate detector", swiggy.length === 2 && swiggy[0].transaction_date === swiggy[1].transaction_date);
  check("has income and expenses", s.transactions.some((t) => t.type === "income") && s.transactions.some((t) => t.type === "expense"));
  check("budgets cover the current month", s.budgets.every((b) => new Date(b.period_start) <= now && new Date(b.period_end) > now));
  check("no goal is already past its target", s.goals.every((g) => g.saved_amount < g.target_amount));
}

Promise.all(asyncChecks).then(() => {
  console.log(
    failures === 0
      ? "\nAll calculation checks passed.\n"
      : `\n${failures} FAILURE(S)\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
});
