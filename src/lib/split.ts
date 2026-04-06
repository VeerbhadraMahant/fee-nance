import { approxEqual, assertPositiveAmount, roundCurrency } from "@/lib/money";

export type SplitType = "equal" | "custom" | "percentage";

export interface SplitInput {
  userId: string;
  amount?: number;
  percentage?: number;
}

export interface PayerInput {
  userId: string;
  amount: number;
}

export interface ComputedShare {
  userId: string;
  shareAmount: number;
}

export interface PairwiseBalance {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

function assertTotals(total: number, computedTotal: number, fieldName: string) {
  if (!approxEqual(total, computedTotal)) {
    throw new Error(`${fieldName} total must exactly match expense total`);
  }
}

export function validatePayers(totalAmount: number, payers: PayerInput[]) {
  if (!payers.length) {
    throw new Error("At least one payer is required");
  }

  const payerSum = roundCurrency(
    payers.reduce((acc, payer) => {
      assertPositiveAmount(payer.amount);
      return acc + payer.amount;
    }, 0),
  );

  assertTotals(totalAmount, payerSum, "Payer");
}

export function computeShares(
  totalAmount: number,
  splitType: SplitType,
  splits: SplitInput[],
  memberIds: string[],
): ComputedShare[] {
  assertPositiveAmount(totalAmount);

  if (!memberIds.length) {
    throw new Error("Group must have members");
  }

  const memberSet = new Set(memberIds);

  if (splitType === "equal") {
    const perMember = roundCurrency(totalAmount / memberIds.length);
    let running = 0;

    return memberIds.map((userId, index) => {
      const amount =
        index === memberIds.length - 1 ? roundCurrency(totalAmount - running) : perMember;
      running = roundCurrency(running + amount);
      return { userId, shareAmount: amount };
    });
  }

  if (!splits.length) {
    throw new Error("Split details are required for custom and percentage splits");
  }

  for (const split of splits) {
    if (!memberSet.has(split.userId)) {
      throw new Error("Split contains a user who is not in the group");
    }
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

  const computed = splits.map((split) => ({
    userId: split.userId,
    shareAmount: roundCurrency((totalAmount * (split.percentage ?? 0)) / 100),
  }));

  const percentageTotal = roundCurrency(
    splits.reduce((acc, split) => acc + (split.percentage ?? 0), 0),
  );

  if (!approxEqual(percentageTotal, 100)) {
    throw new Error("Percentage split must total 100");
  }

  const amountTotal = roundCurrency(computed.reduce((acc, split) => acc + split.shareAmount, 0));
  assertTotals(totalAmount, amountTotal, "Percentage split");

  return computed;
}

export function computePairwiseBalances(
  memberIds: string[],
  shares: ComputedShare[],
  payers: PayerInput[],
): PairwiseBalance[] {
  const balanceMap = new Map(memberIds.map((id) => [id, 0]));

  for (const share of shares) {
    balanceMap.set(share.userId, roundCurrency((balanceMap.get(share.userId) ?? 0) - share.shareAmount));
  }

  for (const payer of payers) {
    balanceMap.set(payer.userId, roundCurrency((balanceMap.get(payer.userId) ?? 0) + payer.amount));
  }

  const creditors = Array.from(balanceMap.entries())
    .filter(([, amount]) => amount > 0)
    .map(([userId, amount]) => ({ userId, amount }));

  const debtors = Array.from(balanceMap.entries())
    .filter(([, amount]) => amount < 0)
    .map(([userId, amount]) => ({ userId, amount: Math.abs(amount) }));

  const pairwise: PairwiseBalance[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settlementAmount = roundCurrency(Math.min(debtor.amount, creditor.amount));

    if (settlementAmount > 0) {
      pairwise.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount: settlementAmount,
      });
    }

    debtor.amount = roundCurrency(debtor.amount - settlementAmount);
    creditor.amount = roundCurrency(creditor.amount - settlementAmount);

    if (debtor.amount <= 0.01) {
      i += 1;
    }

    if (creditor.amount <= 0.01) {
      j += 1;
    }
  }

  return pairwise;
}
