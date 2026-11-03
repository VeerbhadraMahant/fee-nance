/**
 * How a budget's spend compares with how much of its period has passed.
 * 62% spent with 45% of the month gone is a different story from 62% spent
 * on day 28. Null outside the period, where pace means nothing.
 */
export function budgetPace(
  budget: { amount: number; periodStart: string; periodEnd: string },
  spent: number,
  now = Date.now(),
) {
  const start = new Date(budget.periodStart).getTime();
  const end = new Date(budget.periodEnd).getTime();
  if (now < start || now > end || end <= start || budget.amount <= 0) return null;

  const elapsed = (now - start) / (end - start);
  const used = spent / budget.amount;
  // Under 5% of the period gone, a single purchase swings the ratio wildly.
  if (elapsed < 0.05) return null;

  const projected = spent / elapsed;
  return {
    elapsedPct: elapsed * 100,
    /** Positive: spending faster than the calendar. */
    aheadBy: (used - elapsed) * 100,
    projected,
    willExceed: projected > budget.amount * 1.02,
  };
}
