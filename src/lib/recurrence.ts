/**
 * Recurrence stepping. One rule, two callers: the on-demand generator at
 * `POST /api/private/transactions/recurring/run` advances `nextRunAt` after
 * materialising an occurrence, and the forecast walks the same steps forward
 * without writing anything. Keeping them on one function is what stops a
 * projected occurrence from landing on a different date than the one the
 * runner will eventually create.
 */

export type RecurringFrequency = "monthly" | "yearly";

export function getNextDate(date: Date, frequency: RecurringFrequency) {
  const next = new Date(date);

  if (frequency === "monthly") {
    next.setMonth(next.getMonth() + 1);
    return next;
  }

  next.setFullYear(next.getFullYear() + 1);
  return next;
}

/**
 * Every occurrence strictly after `from` and up to and including `until`.
 *
 * `from` is the rule's `nextRunAt` — the occurrence that has not been
 * generated yet — so it is included in the result. Capped at `limit` so a
 * malformed rule (a `nextRunAt` years in the past) can't spin the loop.
 */
export function projectOccurrences(
  from: Date,
  frequency: RecurringFrequency,
  until: Date,
  limit = 240,
): Date[] {
  const dates: Date[] = [];
  let cursor = new Date(from);

  while (cursor.getTime() <= until.getTime() && dates.length < limit) {
    dates.push(new Date(cursor));
    cursor = getNextDate(cursor, frequency);
  }

  return dates;
}
