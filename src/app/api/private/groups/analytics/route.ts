/**
 * GET /api/private/groups/analytics
 * Overview analytics across ALL groups the current user is a member of.
 *
 * Returns for each group:
 *   - name
 *   - totalSpend  (sum of all GroupExpense amounts)
 *   - userPaid    (how much the current user paid across all expenses)
 *   - userOwes    (how much the current user still owes after settlements)
 *   - userIsOwed  (how much is still owed TO the current user)
 *   - netPosition (positive = user is net creditor, negative = net debtor)
 *
 * Also returns a cross-group Sankey payload:
 *   topFlows — for each group where |netPosition| > 0, one flow:
 *     { groupId, groupName, direction: "owed"|"owes", amount }
 */

import { requireUser } from "@/lib/api-auth";
import { cached } from "@/lib/cache";
import { loadGroupExpenses, loadSettlements } from "@/lib/data/groups";
import { roundCurrency } from "@/lib/money";
import { handleRouteError, must } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

async function buildOverview(supabase: SupabaseServerClient, userId: string) {
  // RLS returns only the caller's groups; member counts come back as an aggregate.
  const groups = must(
    await supabase.from("groups").select("id, name, group_members(count)"),
  ) as Array<{ id: string; name: string; group_members: Array<{ count: number }> }>;

  if (!groups.length) {
    return { groups: [], totalOwedToMe: 0, totalIOwe: 0, sankeyFlows: [] };
  }

  const groupIds = groups.map((g) => g.id);
  const [allExpenses, allSettlements] = await Promise.all([
    loadGroupExpenses(supabase, groupIds),
    loadSettlements(supabase, groupIds),
  ]);

  // Per-group net position
  const result = groups.map((group) => {
    const gid = group.id;
    const expenses = allExpenses.filter((e) => e.groupId === gid);
    const settlements = allSettlements.filter((s) => s.groupId === gid);

    // Total spend in the group
    const totalSpend = expenses.reduce((sum, e) => sum + e.amount, 0);

    // How much the user paid
    const userPaid = expenses.reduce((sum, e) => {
      const payer = e.paidBy.find((p) => p.userId === userId);
      return sum + (payer?.amount ?? 0);
    }, 0);

    // How much the user owes (their split share)
    const userShare = expenses.reduce((sum, e) => {
      const split = e.splits.find((s) => s.userId === userId);
      return sum + (split?.shareAmount ?? 0);
    }, 0);

    // Net from expenses: paid - share = raw balance before settlements
    let netBalance = userPaid - userShare;

    // Apply settlements
    for (const s of settlements) {
      const from = s.fromUserId;
      const to = s.toUserId;
      if (from === userId) netBalance += s.amount;  // user paid someone → reduces debt
      if (to === userId) netBalance -= s.amount;    // user received payment → reduces credit
    }

    const netPosition = roundCurrency(netBalance);

    return {
      groupId: gid,
      groupName: group.name,
      memberCount: group.group_members[0]?.count ?? 0,
      totalSpend: roundCurrency(totalSpend),
      userPaid: roundCurrency(userPaid),
      userShare: roundCurrency(userShare),
      netPosition, // positive = owed to user, negative = user owes
    };
  });

  const totalOwedToMe = result
    .filter((g) => g.netPosition > 0)
    .reduce((sum, g) => sum + g.netPosition, 0);

  const totalIOwe = result
    .filter((g) => g.netPosition < 0)
    .reduce((sum, g) => sum + Math.abs(g.netPosition), 0);

  // Sankey flows: from user → groups where user owes; from groups → user where owed
  const sankeyFlows = result
    .filter((g) => Math.abs(g.netPosition) > 0.5)
    .map((g) => ({
      groupId: g.groupId,
      groupName: g.groupName,
      direction: g.netPosition > 0 ? ("owed" as const) : ("owes" as const),
      amount: Math.abs(g.netPosition),
    }));

  return {
    groups: result,
    totalOwedToMe: roundCurrency(totalOwedToMe),
    totalIOwe: roundCurrency(totalIOwe),
    sankeyFlows,
  };
}

export async function GET() {
  try {
    const { supabase, userId } = await requireUser();
    const payload = await cached(userId, "groups-overview", null, () => buildOverview(supabase, userId));
    return Response.json(payload);
  } catch (error) {
    return handleRouteError(error, "Failed to load group analytics");
  }
}
