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
 * Without a query, the caller leaves: refused while they owe or are owed
 * anything; an owner hands the group to the longest-standing member; the
 * last member out deletes it. With `?action=delete`, the owner deletes the
 * group (and, by cascade, its expenses and settlements) for everyone.
 */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireUser();
    const { groupId } = await params;
    const deleteForEveryone = new URL(request.url).searchParams.get("action") === "delete";

    const group = await loadGroup(supabase, groupId);
    if (!group) return jsonError("Group not found", 404);

    const action = must(
      deleteForEveryone
        ? await supabase.rpc("delete_group", { p_group_id: groupId })
        : await supabase.rpc("leave_group", { p_group_id: groupId }),
    ) as "deleted" | "left";

    await invalidateUsers(memberIdsOf(group));
    return Response.json({ success: true, action });
  } catch (error) {
    return handleRouteError(error, "Failed to delete group");
  }
}
