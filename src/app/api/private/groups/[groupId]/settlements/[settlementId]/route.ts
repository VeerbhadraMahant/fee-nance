import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { loadGroup, memberIdsOf } from "@/lib/data/groups";
import { jsonError } from "@/lib/http";
import { handleRouteError, isUuid, must } from "@/lib/route";

type Params = { params: Promise<{ groupId: string; settlementId: string }> };

/**
 * Deletes a settlement recorded by mistake. Row-level security allows it for
 * the payer, the payee and whoever recorded it; anyone else gets zero rows,
 * which is a 404 here, the same as a settlement that doesn't exist.
 */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { supabase } = await requireUser();
    const { groupId, settlementId } = await params;
    if (!isUuid(settlementId)) return jsonError("Settlement not found", 404);

    const group = await loadGroup(supabase, groupId);
    if (!group) return jsonError("Group not found", 404);

    const deleted = must(
      await supabase
        .from("settlements")
        .delete()
        .eq("id", settlementId)
        .eq("group_id", groupId)
        .select("id"),
    ) as Array<{ id: string }>;
    if (!deleted.length) return jsonError("Settlement not found", 404);

    await invalidateUsers(memberIdsOf(group));
    return Response.json({ success: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete settlement", {
      notFoundMessage: "Settlement not found",
    });
  }
}
