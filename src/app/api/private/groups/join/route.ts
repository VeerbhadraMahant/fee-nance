import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { loadGroup, memberIdsOf } from "@/lib/data/groups";
import { jsonError } from "@/lib/http";
import { handleRouteError, must } from "@/lib/route";

const joinGroupSchema = z.object({
  inviteCode: z.string().trim().min(4).max(20),
});

export async function POST(request: Request) {
  try {
    const { supabase } = await requireUser();
    const payload = joinGroupSchema.parse(await request.json());

    // Idempotent: joining a group you're already in just returns it.
    const groupId = must(await supabase.rpc("join_group", { p_invite_code: payload.inviteCode })) as string;
    const group = await loadGroup(supabase, groupId);
    if (!group) return jsonError("Group not found", 404);

    // Everyone's balances view now includes a new member.
    await invalidateUsers(memberIdsOf(group));
    return Response.json({ group });
  } catch (error) {
    return handleRouteError(error, "Failed to join group");
  }
}
