import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { groupExpenseSchema, toGroupExpenseArgs } from "@/lib/data/group-expense-input";
import { loadGroup, memberIdsOf } from "@/lib/data/groups";
import { GROUP_EXPENSE_SELECT, toGroupExpense, type GroupExpenseRow } from "@/lib/data/mappers";
import { jsonError } from "@/lib/http";
import { handleRouteError, isUuid, must } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/**
 * Edit or delete one group expense. Allowed for the member who added it and
 * for the group owner; the SQL functions enforce that and re-check the parts
 * against the total, exactly as on create. Every member's balances and
 * cached views are invalidated, since one expense moves everyone's position.
 */

type Params = { params: Promise<{ groupId: string; expenseId: string }> };

/** True when the expense exists in this group and the caller can see it. */
async function belongsToGroup(supabase: SupabaseServerClient, groupId: string, expenseId: string) {
  const row = must(
    await supabase.from("group_expenses").select("id").eq("id", expenseId).eq("group_id", groupId).maybeSingle(),
  );
  return Boolean(row);
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireUser();
    const payload = groupExpenseSchema.parse(await request.json());
    const { groupId, expenseId } = await params;
    if (!isUuid(expenseId)) return jsonError("Expense not found", 404);

    const group = await loadGroup(supabase, groupId);
    if (!group) return jsonError("Group not found", 404);
    const memberIds = memberIdsOf(group);
    if (!(await belongsToGroup(supabase, groupId, expenseId))) return jsonError("Expense not found", 404);

    must(
      await supabase.rpc("update_group_expense", {
        p_expense_id: expenseId,
        ...toGroupExpenseArgs(payload, memberIds),
        p_incurred_at: payload.incurredAt ?? null,
      }),
    );

    const row = must(
      await supabase
        .from("group_expenses")
        .select(GROUP_EXPENSE_SELECT)
        .eq("id", expenseId)
        .eq("group_id", groupId)
        .maybeSingle(),
    ) as GroupExpenseRow | null;
    if (!row) return jsonError("Expense not found", 404);

    await invalidateUsers(memberIds);
    return Response.json({ expense: toGroupExpense(row) });
  } catch (error) {
    return handleRouteError(error, "Failed to update group expense", {
      notFoundMessage: "Expense not found",
    });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { supabase } = await requireUser();
    const { groupId, expenseId } = await params;
    if (!isUuid(expenseId)) return jsonError("Expense not found", 404);

    const group = await loadGroup(supabase, groupId);
    if (!group) return jsonError("Group not found", 404);
    if (!(await belongsToGroup(supabase, groupId, expenseId))) return jsonError("Expense not found", 404);

    must(await supabase.rpc("delete_group_expense", { p_expense_id: expenseId }));

    await invalidateUsers(memberIdsOf(group));
    return Response.json({ success: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete group expense", {
      notFoundMessage: "Expense not found",
    });
  }
}
