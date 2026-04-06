import { z } from "zod";
import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { toObjectId } from "@/lib/object-id";
import { Group } from "@/models/Group";

const joinGroupSchema = z.object({
  inviteCode: z.string().trim().min(4).max(20),
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = joinGroupSchema.parse(await request.json());

    await connectToDatabase();

    const group = await Group.findOne({
      inviteCode: payload.inviteCode.toUpperCase(),
    });

    if (!group) {
      return jsonError("Invalid invite code", 404);
    }

    const alreadyMember = group.members.some(
      (member: { userId: { toString(): string } }) => member.userId.toString() === userId,
    );

    if (alreadyMember) {
      return Response.json({ group });
    }

    group.members.push({
      userId: toObjectId(userId),
      role: "member",
      joinedAt: new Date(),
    });

    await group.save();

    return Response.json({ group });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid invite code", 422);
    }

    console.error(error);
    return jsonError("Failed to join group", 500);
  }
}
