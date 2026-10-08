import { requireUser } from "@/lib/api-auth";
import { loadGroup, loadGroupExpenses, loadSettlements, memberIdsOf } from "@/lib/data/groups";
import { jsonError } from "@/lib/http";
import { roundCurrency } from "@/lib/money";
import { handleRouteError } from "@/lib/route";

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
    const { supabase } = await requireUser();
    const { groupId } = await params;

    const group = await loadGroup(supabase, groupId);
    if (!group) return jsonError("Group not found", 404);

    const memberIds = memberIdsOf(group);
    const balances = new Map<string, number>(memberIds.map((id) => [id, 0]));

    const [expenses, settlements] = await Promise.all([
      loadGroupExpenses(supabase, [groupId]),
      loadSettlements(supabase, [groupId]),
    ]);

    for (const expense of expenses) {
      for (const split of expense.splits) {
        balances.set(split.userId, roundCurrency((balances.get(split.userId) ?? 0) - split.shareAmount));
      }
      for (const payer of expense.paidBy) {
        balances.set(payer.userId, roundCurrency((balances.get(payer.userId) ?? 0) + payer.amount));
      }
    }

    for (const settlement of settlements) {
      const { fromUserId, toUserId, amount } = settlement;
      balances.set(fromUserId, roundCurrency((balances.get(fromUserId) ?? 0) + amount));
      balances.set(toUserId, roundCurrency((balances.get(toUserId) ?? 0) - amount));
    }

    return Response.json({
      balances: Array.from(balances.entries()).map(([memberId, netAmount]) => ({
        memberId,
        netAmount,
      })),
      pairwiseSettlements: simplifyPairwise(balances),
    });
  } catch (error) {
    return handleRouteError(error, "Failed to calculate balances");
  }
}
