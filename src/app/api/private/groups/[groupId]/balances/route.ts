import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { roundCurrency } from "@/lib/money";
import { toObjectId } from "@/lib/object-id";
import { Group } from "@/models/Group";
import { GroupExpense } from "@/models/GroupExpense";
import { Settlement } from "@/models/Settlement";

function simplifyPairwise(balanceMap: Map<string, number>) {
  const creditors = Array.from(balanceMap.entries())
    .filter(([, amount]) => amount > 0.01)
    .map(([userId, amount]) => ({ userId, amount }));

  const debtors = Array.from(balanceMap.entries())
    .filter(([, amount]) => amount < -0.01)
    .map(([userId, amount]) => ({ userId, amount: Math.abs(amount) }));

  const pairwise: Array<{ fromUserId: string; toUserId: string; amount: number }> = [];

  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = roundCurrency(Math.min(debtor.amount, creditor.amount));

    if (amount > 0) {
      pairwise.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount,
      });
    }

    debtor.amount = roundCurrency(debtor.amount - amount);
    creditor.amount = roundCurrency(creditor.amount - amount);

    if (debtor.amount <= 0.01) {
      i += 1;
    }

    if (creditor.amount <= 0.01) {
      j += 1;
    }
  }

  return pairwise;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { groupId } = await params;

    await connectToDatabase();

    const group = await Group.findById(toObjectId(groupId)).lean();

    if (!group) {
      return jsonError("Group not found", 404);
    }

    const memberIds = group.members.map((member: { userId: { toString(): string } }) =>
      member.userId.toString(),
    );

    if (!memberIds.includes(userId)) {
      return jsonError("Forbidden", 403);
    }

    const balances = new Map<string, number>(memberIds.map((id: string) => [id, 0]));

    const expenses = await GroupExpense.find({ groupId: toObjectId(groupId) }).lean();

    for (const expense of expenses) {
      for (const split of expense.splits) {
        const splitUserId = split.userId.toString();
        balances.set(splitUserId, roundCurrency((balances.get(splitUserId) ?? 0) - split.shareAmount));
      }

      for (const payer of expense.paidBy) {
        const payerId = payer.userId.toString();
        balances.set(payerId, roundCurrency((balances.get(payerId) ?? 0) + payer.amount));
      }
    }

    const settlements = await Settlement.find({ groupId: toObjectId(groupId) }).lean();

    for (const settlement of settlements) {
      const fromUserId = settlement.fromUserId.toString();
      const toUserId = settlement.toUserId.toString();

      balances.set(fromUserId, roundCurrency((balances.get(fromUserId) ?? 0) + settlement.amount));
      balances.set(toUserId, roundCurrency((balances.get(toUserId) ?? 0) - settlement.amount));
    }

    return Response.json({
      balances: Array.from(balances.entries()).map(([memberId, netAmount]) => ({
        memberId,
        netAmount,
      })),
      pairwiseSettlements: simplifyPairwise(balances),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    console.error(error);
    return jsonError("Failed to calculate balances", 500);
  }
}
