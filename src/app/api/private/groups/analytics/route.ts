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

import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { roundCurrency } from "@/lib/money";
import { toObjectId } from "@/lib/object-id";
import { logger } from "@/lib/logger";
import { Types } from "mongoose";
import { Group } from "@/models/Group";
import { GroupExpense } from "@/models/GroupExpense";
import { Settlement } from "@/models/Settlement";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const userId = await requireUserId();
    const userOid = toObjectId(userId);

    await connectToDatabase();

    // All groups this user belongs to
    const groups = await Group.find({ "members.userId": userOid })
      .select("_id name members")
      .lean();

    if (!groups.length) {
      return NextResponse.json({
        groups: [],
        totalOwedToMe: 0,
        totalIOwe: 0,
        sankeyFlows: [],
      });
    }

    const groupIds = groups.map((g) => g._id as Types.ObjectId);

    // All expenses across those groups
    const allExpenses = await GroupExpense.find({ groupId: { $in: groupIds } })
      .select("groupId paidBy splits amount")
      .lean();

    // All settlements across those groups
    const allSettlements = await Settlement.find({ groupId: { $in: groupIds } })
      .select("groupId fromUserId toUserId amount")
      .lean();

    // Per-group net position
    const result = groups.map((group) => {
      const gid = (group._id as Types.ObjectId).toString();
      const expenses = allExpenses.filter((e) => e.groupId.toString() === gid);
      const settlements = allSettlements.filter((s) => s.groupId.toString() === gid);

      // Total spend in the group
      const totalSpend = expenses.reduce((sum, e) => sum + e.amount, 0);

      // How much the user paid
      const userPaid = expenses.reduce((sum, e) => {
        const payer = e.paidBy.find((p: { userId: Types.ObjectId; amount: number }) => p.userId.toString() === userId);
        return sum + (payer?.amount ?? 0);
      }, 0);

      // How much the user owes (their split share)
      const userShare = expenses.reduce((sum, e) => {
        const split = e.splits.find((s: { userId: Types.ObjectId; shareAmount: number }) => s.userId.toString() === userId);
        return sum + (split?.shareAmount ?? 0);
      }, 0);

      // Net from expenses: paid - share = raw balance before settlements
      let netBalance = userPaid - userShare;

      // Apply settlements
      for (const s of settlements) {
        const from = s.fromUserId.toString();
        const to = s.toUserId.toString();
        if (from === userId) netBalance += s.amount;  // user paid someone → reduces debt
        if (to === userId) netBalance -= s.amount;    // user received payment → reduces credit
      }

      const netPosition = roundCurrency(netBalance);

      return {
        groupId: gid,
        groupName: group.name as string,
        memberCount: (group.members as unknown[]).length,
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

    return NextResponse.json({
      groups: result,
      totalOwedToMe: roundCurrency(totalOwedToMe),
      totalIOwe: roundCurrency(totalIOwe),
      sankeyFlows,
    });
  } catch (error) {
    logger.error("Group analytics overview error", error);
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }
    return jsonError("Internal Server Error", 500);
  }
}
