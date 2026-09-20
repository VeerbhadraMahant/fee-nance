import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { getGroupMemberIds } from "@/lib/group-members";
import { jsonError } from "@/lib/http";
import { toObjectId } from "@/lib/object-id";
import { logger } from "@/lib/logger";
import { Group } from "@/models/Group";
import { GroupExpense } from "@/models/GroupExpense";
import { Settlement } from "@/models/Settlement";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { groupId } = await params;

    await connectToDatabase();

    const group = await Group.findById(toObjectId(groupId))
      .populate("members.userId", "name email")
      .lean();

    if (!group) {
      return jsonError("Group not found", 404);
    }

    const memberIds = getGroupMemberIds(group);

    if (!memberIds.includes(userId)) {
      return jsonError("Forbidden", 403);
    }

    return Response.json({ group });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof Error && error.message === "Invalid identifier") {
      return jsonError("Invalid identifier", 422);
    }

    logger.error("Unhandled API route error", error);
    return jsonError("Failed to load group", 500);
  }
}

/**
 * The owner deleting the group removes it (and its expenses/settlements)
 * for everyone. A non-owner member "deleting" it just leaves the group —
 * the group and its history stay intact for the remaining members.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { groupId } = await params;

    await connectToDatabase();

    const objectGroupId = toObjectId(groupId);
    const group = await Group.findById(objectGroupId).lean();

    if (!group) {
      return jsonError("Group not found", 404);
    }

    const memberIds = getGroupMemberIds(group);

    if (!memberIds.includes(userId)) {
      return jsonError("Forbidden", 403);
    }

    const isOwner = group.members.some(
      (member: { userId: { toString(): string }; role: string }) =>
        member.userId.toString() === userId && member.role === "owner",
    );

    if (isOwner) {
      await Promise.all([
        GroupExpense.deleteMany({ groupId: objectGroupId }),
        Settlement.deleteMany({ groupId: objectGroupId }),
        Group.deleteOne({ _id: objectGroupId }),
      ]);

      return Response.json({ success: true, action: "deleted" });
    }

    await Group.updateOne(
      { _id: objectGroupId },
      { $pull: { members: { userId: toObjectId(userId) } } },
    );

    return Response.json({ success: true, action: "left" });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof Error && error.message === "Invalid identifier") {
      return jsonError("Invalid identifier", 422);
    }

    logger.error("Unhandled API route error", error);
    return jsonError("Failed to delete group", 500);
  }
}
