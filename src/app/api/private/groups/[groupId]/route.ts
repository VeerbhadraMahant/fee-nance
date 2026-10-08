import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { loadGroup, memberIdsOf } from "@/lib/data/groups";
import { jsonError } from "@/lib/http";
import { handleRouteError, must } from "@/lib/route";

type Params = { params: Promise<{ groupId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { supabase } = await requireUser();
    const { groupId } = await params;

    const group = await loadGroup(supabase, groupId);
    if (!group) return jsonError("Group not found", 404);

    return Response.json({ group });
  } catch (error) {
    return handleRouteError(error, "Failed to load group");
  }
}

/**
 * The owner deleting the group removes it (and, by cascade, its expenses and
 * settlements) for everyone. A non-owner member "deleting" it just leaves —
 * the group and its history stay intact for the remaining members.
 */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { supabase } = await requireUser();
    const { groupId } = await params;

    const group = await loadGroup(supabase, groupId);
    if (!group) return jsonError("Group not found", 404);

    const action = must(
      await supabase.rpc("leave_or_delete_group", { p_group_id: groupId }),
    ) as "deleted" | "left";

    await invalidateUsers(memberIdsOf(group));
    return Response.json({ success: true, action });
  } catch (error) {
    return handleRouteError(error, "Failed to delete group");
  }
}
