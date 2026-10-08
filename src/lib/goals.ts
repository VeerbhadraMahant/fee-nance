/**
 * Savings-goal projection. Ported from HackMatrix's `analytics/goals.py`
 * (projection) and `goals_router.py` (required-monthly), as pure functions so
 * the goals page can re-run them live as a contribution slider moves.
 */

export const GOAL_THEMES = [
  "general",
  "emergency",
  "travel",
  "home",
  "vehicle",
  "education",
  "gadget",
  "wedding",
] as const;

export type GoalTheme = (typeof GOAL_THEMES)[number];

export interface GoalLike {
  targetAmount: number;
  savedAmount: number;
  targetDate?: string | Date | null;
}

export interface GoalProjection {
  remaining: number;
  progressPct: number;
  complete: boolean;
  /** Months to finish at `monthlyContribution`; null when it never finishes. */
  monthsToGo: number | null;
  projectedDate: Date | null;
  /** What has to go in each month to land on the target date; null with no date. */
  requiredMonthly: number | null;
  /** True when there is no target date, or the projection lands on/before it. */
  onTrack: boolean;
}

export function addMonths(from: Date, months: number) {
  const date = new Date(from);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  // Clamp to the last day of the target month rather than rolling over.
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return date;
}

/** Whole months from `from` to `to`, counting a part month as a full one. */
export function monthsBetween(from: Date, to: Date) {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() > from.getDate()) months += 1;
  return Math.max(0, months);
}

export function projectGoal(
  goal: GoalLike,
  monthlyContribution: number,
  today: Date = new Date(),
): GoalProjection {
  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
  const progressPct =
    goal.targetAmount > 0 ? Math.min(100, (goal.savedAmount / goal.targetAmount) * 100) : 0;
  const targetDate = goal.targetDate ? new Date(goal.targetDate) : null;

  if (remaining <= 0) {
    return {
      remaining: 0,
      progressPct: 100,
      complete: true,
      monthsToGo: 0,
      projectedDate: today,
      requiredMonthly: 0,
      onTrack: true,
    };
  }

  let requiredMonthly: number | null = null;
  if (targetDate) {
    const months = monthsBetween(today, targetDate);
    // A date already passed needs the whole remainder now.
    requiredMonthly = Math.ceil(remaining / Math.max(1, months));
  }

  if (monthlyContribution <= 0) {
    return {
      remaining,
      progressPct,
      complete: false,
      monthsToGo: null,
      projectedDate: null,
      requiredMonthly,
      onTrack: false,
    };
  }

  const monthsToGo = Math.ceil(remaining / monthlyContribution);
  const projectedDate = addMonths(today, monthsToGo);

  return {
    remaining,
    progressPct,
    complete: false,
    monthsToGo,
    projectedDate,
    requiredMonthly,
    onTrack: !targetDate || projectedDate.getTime() <= targetDate.getTime(),
  };
}
