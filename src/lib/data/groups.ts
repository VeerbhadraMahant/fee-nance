import {
  GROUP_EXPENSE_SELECT,
  GROUP_SELECT,
  toGroup,
  toGroupExpense,
  toSettlement,
  type GroupExpenseRow,
  type GroupRow,
  type SettlementRow,
} from "@/lib/data/mappers";
import { isUuid, must, selectAll } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/**
 * Group reads shared by the group routes. Row-level security only returns
 * groups the caller belongs to, so "not a member" and "doesn't exist" both
 * come back as null — and the routes answer 404 for both, which (unlike the
 * old 403) doesn't confirm that someone else's group id exists.
 */

export async function loadGroup(supabase: SupabaseServerClient, groupId: string) {
  if (!isUuid(groupId)) return null;
  const row = must(
    await supabase.from("groups").select(GROUP_SELECT).eq("id", groupId).maybeSingle(),
  ) as GroupRow | null;
  return row ? toGroup(row) : null;
}

export type LoadedGroup = NonNullable<Awaited<ReturnType<typeof loadGroup>>>;

export function memberIdsOf(group: LoadedGroup) {
  return group.members.map((member) => member.userId._id);
}

export async function loadGroupExpenses(
  supabase: SupabaseServerClient,
  groupIds: string[],
  { ascending = true }: { ascending?: boolean } = {},
) {
  if (!groupIds.length) return [];
  const rows = await selectAll<GroupExpenseRow>((from, to) =>
    supabase
      .from("group_expenses")
      .select(GROUP_EXPENSE_SELECT)
      .in("group_id", groupIds)
      .order("incurred_at", { ascending })
      .order("id")
      .range(from, to)
      .overrideTypes<GroupExpenseRow[], { merge: false }>(),
  );
  return rows.map(toGroupExpense);
}

export async function loadSettlements(supabase: SupabaseServerClient, groupIds: string[]) {
  if (!groupIds.length) return [];
  const rows = await selectAll<SettlementRow>((from, to) =>
    supabase
      .from("settlements")
      .select("*")
      .in("group_id", groupIds)
      .order("settled_at")
      .order("id")
      .range(from, to),
  );
  return rows.map(toSettlement);
}
