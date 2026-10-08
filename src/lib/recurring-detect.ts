/**
 * Finds charges that repeat on a schedule but were never set up as recurring
 * rules — the subscription quietly renewing every month that the forecast
 * therefore doesn't know about.
 *
 * Ported from HackMatrix's `analytics/recurring.py`: normalise the payee,
 * require three or more occurrences, classify the median gap into a
 * frequency bucket, and score confidence from how tight the amounts and
 * intervals are. The redundant-subscription check (two video streaming
 * services, two music services) comes from the same module.
 */

export type DetectedFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

export interface LedgerCharge {
  id: string;
  title: string;
  amount: number;
  date: Date;
  categoryName: string;
}

export interface DetectedRecurring {
  key: string;
  title: string;
  categoryName: string;
  amount: number;
  frequency: DetectedFrequency;
  occurrences: number;
  lastDate: Date;
  nextExpected: Date;
  /** Rough monthly cost, so different frequencies can be compared and summed. */
  monthlyCost: number;
  confidence: number;
  /** Set when another detected charge sits in the same subscription family. */
  overlapGroup: string | null;
  latestTransactionId: string;
}

const DAY_MS = 86_400_000;

/** [frequency, typical gap in days, tolerance in days] */
const BUCKETS: Array<[DetectedFrequency, number, number]> = [
  ["weekly", 7, 2],
  ["monthly", 30, 5],
  ["quarterly", 91, 10],
  ["yearly", 365, 20],
];

const MONTHLY_FACTOR: Record<DetectedFrequency, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

/** Common Indian OTT and music services. Two in one family looks redundant. */
const SUBSCRIPTION_FAMILIES: Array<[RegExp, string]> = [
  [/\b(netflix|prime video|amazon prime|hotstar|jiocinema|jiohotstar|sonyliv|zee5|apple tv|youtube premium)\b/, "Video streaming"],
  [/\b(spotify|gaana|jiosaavn|wynk|apple music|youtube music)\b/, "Music streaming"],
  [/\b(google one|icloud|dropbox|onedrive)\b/, "Cloud storage"],
];

/** Lowercase, drop trailing reference numbers, collapse punctuation. */
export function normalizePayee(title: string) {
  let s = (title || "").trim().toLowerCase();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/[\s#*_-]*\d{2,}\s*$/, "").trim();
  }
  s = s.replace(/[^a-z0-9&+.\s]/g, " ").replace(/\s+/g, " ").trim();
  return s || (title || "").trim().toLowerCase();
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function cov(values: number[]) {
  if (values.length < 2) return 0;
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  if (m === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(m);
}

function classify(medianGap: number) {
  let best: [DetectedFrequency, number] | null = null;
  let bestDistance = Infinity;
  for (const [frequency, typical, tolerance] of BUCKETS) {
    const distance = Math.abs(medianGap - typical);
    if (distance <= tolerance && distance < bestDistance) {
      best = [frequency, typical];
      bestDistance = distance;
    }
  }
  return best;
}

export function detectRecurring(
  charges: LedgerCharge[],
  { minConfidence = 0.45 } = {},
): DetectedRecurring[] {
  const byPayee = new Map<string, LedgerCharge[]>();
  for (const charge of charges) {
    const key = normalizePayee(charge.title);
    const list = byPayee.get(key);
    if (list) list.push(charge);
    else byPayee.set(key, [charge]);
  }

  const found: DetectedRecurring[] = [];

  for (const [key, list] of byPayee) {
    if (list.length < 3) continue;
    const series = [...list].sort((a, b) => a.date.getTime() - b.date.getTime());

    const gaps: number[] = [];
    for (let i = 1; i < series.length; i += 1) {
      const gap = Math.round((series[i]!.date.getTime() - series[i - 1]!.date.getTime()) / DAY_MS);
      if (gap > 0) gaps.push(gap);
    }
    if (gaps.length < 2) continue;

    const bucket = classify(median(gaps));
    // Irregular cadence is just a payee you visit often, not an obligation.
    if (!bucket) continue;
    const [frequency, typicalGap] = bucket;

    const amounts = series.map((c) => c.amount);
    const amountCov = cov(amounts);
    const gapCov = cov(gaps);

    // 1.0 for identical amounts, 0 by 30% variation; same idea for gaps at 50%.
    const amountScore = Math.max(0, 1 - amountCov / 0.3);
    const intervalScore = Math.max(0, 1 - gapCov / 0.5);
    const confidence = Math.round((0.5 * amountScore + 0.5 * intervalScore) * 100) / 100;
    if (confidence < minConfidence) continue;

    const last = series.at(-1)!;
    const amount = Math.round(median(amounts) * 100) / 100;
    const family = SUBSCRIPTION_FAMILIES.find(([re]) => re.test(key))?.[1] ?? null;

    found.push({
      key,
      title: last.title,
      categoryName: last.categoryName,
      amount,
      frequency,
      occurrences: series.length,
      lastDate: last.date,
      nextExpected: new Date(last.date.getTime() + typicalGap * DAY_MS),
      monthlyCost: Math.round(amount * MONTHLY_FACTOR[frequency] * 100) / 100,
      confidence,
      overlapGroup: family,
      latestTransactionId: last.id,
    });
  }

  // Only flag a family as overlapping when two or more of its members recur.
  const familyCounts = new Map<string, number>();
  for (const item of found) {
    if (item.overlapGroup) {
      familyCounts.set(item.overlapGroup, (familyCounts.get(item.overlapGroup) ?? 0) + 1);
    }
  }
  for (const item of found) {
    if (item.overlapGroup && (familyCounts.get(item.overlapGroup) ?? 0) < 2) {
      item.overlapGroup = null;
    }
  }

  return found.sort((a, b) => b.monthlyCost - a.monthlyCost);
}
