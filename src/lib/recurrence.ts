/**
 * Recurrence stepping. One rule, two callers: the generator at
 * `POST /api/private/transactions/recurring/run` advances `nextRunAt` after
 * materialising an occurrence, and the forecast walks the same steps forward
 * without writing anything. Keeping them on one function is what stops a
 * projected occurrence from landing on a different date than the one the
 * runner will eventually create.
 *
 * Dates are stored as UTC midnight of the chosen day, so stepping uses the
 * UTC calendar. A rule keeps its anchor day: one on the 31st lands on the
 * last day of shorter months (28 Feb, 30 Apr) and returns to the 31st when
 * the month has one, instead of drifting to the 3rd the way Date.setMonth
 * overflows.
 */

export type RecurringFrequency = "monthly" | "yearly";

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** `date` moved by `months` calendar months, on `anchorDay` or the month's last day. */
function addMonthsClamped(date: Date, months: number, anchorDay: number) {
  const totalMonths = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths - year * 12;
  const day = Math.min(anchorDay, daysInUtcMonth(year, month));

  return new Date(
    Date.UTC(
      year,
      month,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/**
 * The occurrence after `date`. `anchorDay` is the day of month the rule was
 * set up on; pass it whenever `date` may already have been clamped (a rule on
 * the 31st stepping out of February), or the rule would stay on the 28th.
 */
export function getNextDate(
  date: Date,
  frequency: RecurringFrequency,
  anchorDay = date.getUTCDate(),
) {
  return addMonthsClamped(date, frequency === "monthly" ? 1 : 12, anchorDay);
}

/**
 * The first occurrence still to generate for a rule dated `ruleDate`.
 *
 * The rule's own transaction is the occurrence on `ruleDate`, so the next one
 * is a period later. A requested `nextRunAt` is honoured only when it falls
 * after the rule's date; earlier clients sent the rule's date itself, which
 * made the first run duplicate the rule.
 */
export function firstRunAfter(ruleDate: Date, frequency: RecurringFrequency, requested?: Date) {
  if (requested && requested.getTime() > ruleDate.getTime()) return requested;
  return getNextDate(ruleDate, frequency);
}

/**
 * Every occurrence from `from` up to and including `until`.
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
  anchorDay = from.getUTCDate(),
): Date[] {
  const dates: Date[] = [];
  let cursor = new Date(from);

  while (cursor.getTime() <= until.getTime() && dates.length < limit) {
    dates.push(new Date(cursor));
    cursor = getNextDate(cursor, frequency, anchorDay);
  }

  return dates;
}
