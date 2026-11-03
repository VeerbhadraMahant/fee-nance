import { assertPositiveAmount, roundCurrency } from "@/lib/money";

export type SplitType = "equal" | "custom" | "percentage" | "itemized";

export interface SplitInput {
  userId: string;
  amount?: number;
  percentage?: number;
}

export interface LineItemInput {
  label: string;
  amount: number;
  /** The members who actually consumed this line. */
  sharedBy: string[];
  /**
   * Tax, tip or a service charge: spread across members in proportion to what
   * they owe on the priced items rather than divided evenly, so the person who
   * ordered the ₹80 dessert doesn't carry the same GST as the ₹900 main.
   */
  proportional?: boolean;
}

export interface PayerInput {
  userId: string;
  amount: number;
}

export interface ComputedShare {
  userId: string;
  shareAmount: number;
}

function assertTotals(total: number, computedTotal: number, fieldName: string) {
  if (roundCurrency(total) !== roundCurrency(computedTotal)) {
    throw new Error(`${fieldName} total must exactly match expense total`);
  }
}

function assertDistinctUsers(items: Array<{ userId: string }>, label: string) {
  const set = new Set<string>();

  for (const item of items) {
    if (set.has(item.userId)) {
      throw new Error(`${label} contains duplicate users`);
    }

    set.add(item.userId);
  }
}

export function validatePayers(totalAmount: number, payers: PayerInput[]) {
  if (!payers.length) {
    throw new Error("At least one payer is required");
  }

  assertDistinctUsers(payers, "Payer list");

  const payerSum = roundCurrency(
    payers.reduce((acc, payer) => {
      assertPositiveAmount(payer.amount);
      return acc + payer.amount;
    }, 0),
  );

  assertTotals(totalAmount, payerSum, "Payer");
}

/* ── Itemized allocation ─────────────────────────────────────────────────
 *
 * An itemized split divides each line of a bill among the people who shared
 * that line, which means many small divisions where the other strategies do
 * one. Every one of them is a chance to lose a paisa.
 *
 * These two helpers work in integer paise and hand out the residual by the
 * largest-remainder rule, so the parts always sum to the whole exactly.
 * Equal and percentage splits use the same two helpers; custom splits take
 * the caller's amounts as given and only check the sum.
 */

function toPaise(amount: number) {
  return Math.round(amount * 100);
}

function fromPaise(paise: number) {
  return roundCurrency(paise / 100);
}

function sumValues(values: Iterable<number>) {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * Split evenly, handing the leftover paise out in a stable id order — not
 * input order, so the same bill entered twice allocates identically.
 *
 * `rotation` shifts who receives the residual first. Callers pass the line
 * item's index, so across a bill of many indivisible items the spare paise
 * rotate around the group instead of always landing on whoever sorts first.
 * Still fully deterministic: the same bill always produces the same split.
 */
function allocateEvenly(totalPaise: number, userIds: string[], rotation = 0) {
  const base = Math.floor(totalPaise / userIds.length);
  const allocation = new Map(userIds.map((userId) => [userId, base]));

  const order = [...userIds].sort();
  const start = ((rotation % order.length) + order.length) % order.length;

  let residual = totalPaise - base * userIds.length;

  for (let offset = 0; offset < order.length && residual > 0; offset += 1) {
    const userId = order[(start + offset) % order.length];
    allocation.set(userId, (allocation.get(userId) ?? 0) + 1);
    residual -= 1;
  }

  return allocation;
}

/**
 * Split in proportion to a weight per member. Everyone gets their floor, then
 * the residual paise go to the largest fractional parts first — ties broken by
 * id so the result is deterministic.
 */
function allocateProportionally(totalPaise: number, weights: Map<string, number>) {
  const weightTotal = sumValues(weights.values());

  if (weightTotal <= 0) {
    return allocateEvenly(totalPaise, [...weights.keys()]);
  }

  const exact = [...weights].map(([userId, weight]) => ({
    userId,
    exact: (totalPaise * weight) / weightTotal,
  }));

  const allocation = new Map(
    exact.map((entry) => [entry.userId, Math.floor(entry.exact)]),
  );

  let residual = totalPaise - sumValues(allocation.values());

  const byRemainder = [...exact].sort((a, b) => {
    const remainderDiff =
      (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact));
    return remainderDiff !== 0 ? remainderDiff : a.userId.localeCompare(b.userId);
  });

  for (const entry of byRemainder) {
    if (residual <= 0) break;
    allocation.set(entry.userId, (allocation.get(entry.userId) ?? 0) + 1);
    residual -= 1;
  }

  return allocation;
}

export function computeItemizedShares(
  totalAmount: number,
  lineItems: LineItemInput[],
  memberIds: string[],
): ComputedShare[] {
  assertPositiveAmount(totalAmount);

  if (!lineItems.length) {
    throw new Error("Itemized split requires at least one line item");
  }

  const memberSet = new Set(memberIds);

  for (const item of lineItems) {
    if (!item.sharedBy.length) {
      throw new Error(`"${item.label}" is not assigned to anyone`);
    }

    assertDistinctUsers(
      item.sharedBy.map((userId) => ({ userId })),
      `"${item.label}"`,
    );

    for (const userId of item.sharedBy) {
      if (!memberSet.has(userId)) {
        throw new Error(`"${item.label}" is assigned to a user who is not in the group`);
      }
    }

    if (!Number.isFinite(item.amount) || item.amount <= 0) {
      throw new Error(`"${item.label}" must have an amount greater than zero`);
    }
  }

  const priced = lineItems.filter((item) => !item.proportional);
  const proportional = lineItems.filter((item) => item.proportional);

  if (proportional.length && !priced.length) {
    throw new Error("A proportional charge needs at least one priced item to spread across");
  }

  const totals = new Map<string, number>();

  priced.forEach((item, index) => {
    for (const [userId, paise] of allocateEvenly(
      toPaise(item.amount),
      item.sharedBy,
      index,
    )) {
      totals.set(userId, (totals.get(userId) ?? 0) + paise);
    }
  });

  // Snapshot before the proportional pass, so tax is weighted by the priced
  // subtotal and never by another proportional charge already applied.
  const subtotals = new Map(totals);

  for (const item of proportional) {
    const weights = new Map(
      item.sharedBy.map((userId) => [userId, subtotals.get(userId) ?? 0]),
    );

    for (const [userId, paise] of allocateProportionally(toPaise(item.amount), weights)) {
      totals.set(userId, (totals.get(userId) ?? 0) + paise);
    }
  }

  const itemsTotal = fromPaise(
    lineItems.reduce((acc, item) => acc + toPaise(item.amount), 0),
  );
  assertTotals(totalAmount, itemsTotal, "Line item");

  const shares = memberIds
    .filter((userId) => totals.has(userId))
    .map((userId) => ({
      userId,
      shareAmount: fromPaise(totals.get(userId) ?? 0),
    }));

  assertTotals(totalAmount, fromPaise(sumValues(totals.values())), "Itemized split");

  return shares;
}

export function computeShares(
  totalAmount: number,
  splitType: SplitType,
  splits: SplitInput[],
  memberIds: string[],
  lineItems: LineItemInput[] = [],
): ComputedShare[] {
  assertPositiveAmount(totalAmount);

  if (!memberIds.length) {
    throw new Error("Group must have members");
  }

  const memberSet = new Set(memberIds);

  if (splitType === "itemized") {
    return computeItemizedShares(totalAmount, lineItems, memberIds);
  }

  for (const split of splits) {
    if (!memberSet.has(split.userId)) {
      throw new Error("Split contains a user who is not in the group");
    }
  }

  assertDistinctUsers(splits, "Split list");

  if (splitType === "equal") {
    // `splits` names the participants; none listed means the whole group.
    // Same paise discipline as itemized: the spare paise go out one each in
    // id order, so the parts always sum to the total exactly.
    const participants = splits.length
      ? memberIds.filter((userId) => splits.some((split) => split.userId === userId))
      : memberIds;
    const allocation = allocateEvenly(toPaise(totalAmount), participants);

    return participants.map((userId) => ({
      userId,
      shareAmount: fromPaise(allocation.get(userId) ?? 0),
    }));
  }

  if (!splits.length) {
    throw new Error("Split details are required for custom and percentage splits");
  }

  if (splitType === "custom") {
    const computed = splits.map((split) => ({
      userId: split.userId,
      shareAmount: roundCurrency(split.amount ?? 0),
    }));

    const total = roundCurrency(computed.reduce((acc, split) => acc + split.shareAmount, 0));
    assertTotals(totalAmount, total, "Custom split");

    return computed;
  }

  const percentageTotal = roundCurrency(
    splits.reduce((acc, split) => acc + (split.percentage ?? 0), 0),
  );

  if (percentageTotal !== 100) {
    throw new Error("Percentage split must total 100");
  }

  // Largest remainder in paise, as for proportional line items: 33.33% /
  // 33.33% / 33.34% of ₹100.01 allocates instead of missing by a paisa.
  const allocation = allocateProportionally(
    toPaise(totalAmount),
    new Map(splits.map((split) => [split.userId, split.percentage ?? 0])),
  );

  const computed = splits.map((split) => ({
    userId: split.userId,
    shareAmount: fromPaise(allocation.get(split.userId) ?? 0),
  }));

  const amountTotal = roundCurrency(computed.reduce((acc, split) => acc + split.shareAmount, 0));
  assertTotals(totalAmount, amountTotal, "Percentage split");

  return computed;
}
