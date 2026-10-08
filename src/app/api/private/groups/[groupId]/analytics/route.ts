/**
 * GET /api/private/groups/[groupId]/analytics
 *
 * Deep analytics for a single group:
 *   - spendByMember     — total paid and owed per member
 *   - spendByMonth      — monthly expense timeline with per-member breakdown
 *   - topExpenses       — top 10 largest individual expenses
 *   - splitTypeBreakdown — how much was split equally vs custom vs percentage
 *   - settlementFlow    — pairwise settled amounts (for Sankey)
 *   - memberNetPositions — final net for each member after settlements
 */

import { requireUser } from "@/lib/api-auth";
import { cached } from "@/lib/cache";
import {
  loadGroup,
  loadGroupExpenses,
  loadSettlements,
  memberIdsOf,
  type LoadedGroup,
} from "@/lib/data/groups";
import { jsonError } from "@/lib/http";
import { roundCurrency } from "@/lib/money";
import { handleRouteError } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

async function buildAnalytics(supabase: SupabaseServerClient, group: LoadedGroup) {
  const groupId = group._id;
  const memberIds = memberIdsOf(group);
  const nameMap = new Map<string, string>(group.members.map((m) => [m.userId._id, m.userId.name]));
  const memberName = (id: string) => nameMap.get(id) ?? id.slice(-4);

  const [expenses, settlements] = await Promise.all([
    loadGroupExpenses(supabase, [groupId]),
    loadSettlements(supabase, [groupId]),
  ]);

  // ── 1. Spend by member (paid vs owed) ──────────────────────────────────
  const memberStats = new Map<string, { paid: number; owed: number }>(
    memberIds.map((id) => [id, { paid: 0, owed: 0 }]),
  );
  for (const expense of expenses) {
    for (const p of expense.paidBy) {
      const id = p.userId;
      const entry = memberStats.get(id) ?? { paid: 0, owed: 0 };
      entry.paid += p.amount;
      memberStats.set(id, entry);
    }
    for (const s of expense.splits) {
      const id = s.userId;
      const entry = memberStats.get(id) ?? { paid: 0, owed: 0 };
      entry.owed += s.shareAmount;
      memberStats.set(id, entry);
    }
  }

  const spendByMember = memberIds.map((id) => {
    const s = memberStats.get(id)!;
    return {
      memberId: id,
      name: memberName(id),
      paid: roundCurrency(s.paid),
      owed: roundCurrency(s.owed),
      net: roundCurrency(s.paid - s.owed),
    };
  });

  // ── 2. Monthly timeline ────────────────────────────────────────────────
  type MonthKey = string; // "YYYY-MM"
  const monthlyMap = new Map<MonthKey, { total: number; byMember: Map<string, number> }>();

  for (const expense of expenses) {
    const d = new Date(expense.incurredAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { total: 0, byMember: new Map() });
    }
    const bucket = monthlyMap.get(key)!;
    bucket.total += expense.amount;

    // Credit the payers in the timeline (who actually spent)
    for (const p of expense.paidBy) {
      const mid = p.userId;
      bucket.byMember.set(mid, (bucket.byMember.get(mid) ?? 0) + p.amount);
    }
  }

  const spendByMonth = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, bucket]) => ({
      month,
      total: roundCurrency(bucket.total),
      byMember: memberIds.map((id) => ({
        memberId: id,
        name: memberName(id),
        amount: roundCurrency(bucket.byMember.get(id) ?? 0),
      })),
    }));

  // ── 3. Top 10 expenses ─────────────────────────────────────────────────
  const topExpenses = [...expenses]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map((e) => ({
      title: e.title,
      amount: e.amount,
      splitType: e.splitType,
      date: new Date(e.incurredAt).toISOString().slice(0, 10),
      paidBy: e.paidBy.map((p) => ({
        name: memberName(p.userId),
        amount: p.amount,
      })),
    }));

  // ── 4. Split type breakdown ────────────────────────────────────────────
  const splitTotals: Record<string, number> = {};
  for (const expense of expenses) {
    splitTotals[expense.splitType] = (splitTotals[expense.splitType] ?? 0) + expense.amount;
  }
  const splitTypeBreakdown = Object.entries(splitTotals).map(([type, amount]) => ({
    type,
    amount: roundCurrency(amount),
  }));

  // ── 5. Settlement flow (for Sankey) ────────────────────────────────────
  type PairKey = string;
  const settlementMap = new Map<PairKey, number>();
  for (const s of settlements) {
    const from = s.fromUserId;
    const to = s.toUserId;
    const key: PairKey = `${from}→${to}`;
    settlementMap.set(key, roundCurrency((settlementMap.get(key) ?? 0) + s.amount));
  }
  const settlementFlow = Array.from(settlementMap.entries()).map(([key, amount]) => {
    const [from, to] = key.split("→");
    return { fromId: from, fromName: memberName(from), toId: to, toName: memberName(to), amount };
  });

  // ── 6. Member net positions ─────────────────────────────────────────────
  const netMap = new Map<string, number>(
    memberIds.map((id) => [id, (memberStats.get(id)!.paid - memberStats.get(id)!.owed)]),
  );
  for (const s of settlements) {
    const from = s.fromUserId;
    const to = s.toUserId;
    netMap.set(from, roundCurrency((netMap.get(from) ?? 0) + s.amount));
    netMap.set(to, roundCurrency((netMap.get(to) ?? 0) - s.amount));
  }
  const memberNetPositions = memberIds.map((id) => ({
    memberId: id,
    name: memberName(id),
    net: roundCurrency(netMap.get(id) ?? 0),
  }));

  // ── 7. Per-member share of total spend (for donut) ─────────────────────
  const totalGroupSpend = expenses.reduce((sum, e) => sum + e.amount, 0);
  const memberShareOfSpend = spendByMember.map((m) => ({
    memberId: m.memberId,
    name: m.name,
    amount: m.owed,
    percentage: totalGroupSpend > 0 ? (m.owed / totalGroupSpend) * 100 : 0,
  }));

  return {
    groupName: group.name,
    memberCount: memberIds.length,
    totalGroupSpend: roundCurrency(totalGroupSpend),
    spendByMember,
    spendByMonth,
    topExpenses,
    splitTypeBreakdown,
    settlementFlow,
    memberNetPositions,
    memberShareOfSpend,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { supabase, userId } = await requireUser();
    const { groupId } = await params;

    const group = await loadGroup(supabase, groupId);
    if (!group) return jsonError("Group not found", 404);

    const payload = await cached(userId, "group-analytics", { groupId }, () =>
      buildAnalytics(supabase, group),
    );

    return Response.json(payload);
  } catch (error) {
    return handleRouteError(error, "Failed to load group analytics");
  }
}
