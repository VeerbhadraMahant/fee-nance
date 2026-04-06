import { z } from "zod";
import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { toObjectId } from "@/lib/object-id";
import { Group } from "@/models/Group";
import { Settlement } from "@/models/Settlement";

const settlementSchema = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  amount: z.number().positive(),
  note: z.string().trim().max(500).optional(),
  settledAt: z.string().datetime().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { groupId } = await params;

    await connectToDatabase();

    const group = await Group.findById(toObjectId(groupId)).lean();

    if (!group) {
      return jsonError("Group not found", 404);
    }

    const memberIds = group.members.map((member: { userId: { toString(): string } }) =>
      member.userId.toString(),
    );

    if (!memberIds.includes(userId)) {
      return jsonError("Forbidden", 403);
    }

    const settlements = await Settlement.find({ groupId: toObjectId(groupId) })
      .sort({ settledAt: -1 })
      .lean();

    return Response.json({ settlements });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    console.error(error);
    return jsonError("Failed to load settlements", 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const userId = await requireUserId();
    const payload = settlementSchema.parse(await request.json());
    const { groupId } = await params;

    if (payload.fromUserId === payload.toUserId) {
      return jsonError("Settlement users must be different", 422);
    }

    await connectToDatabase();

    const group = await Group.findById(toObjectId(groupId)).lean();

    if (!group) {
      return jsonError("Group not found", 404);
    }

    const memberIds = group.members.map((member: { userId: { toString(): string } }) =>
      member.userId.toString(),
    );

    if (!memberIds.includes(userId)) {
      return jsonError("Forbidden", 403);
    }

    if (!memberIds.includes(payload.fromUserId) || !memberIds.includes(payload.toUserId)) {
      return jsonError("Settlement users must belong to the group", 422);
    }

    const settlement = await Settlement.create({
      groupId: toObjectId(groupId),
      fromUserId: toObjectId(payload.fromUserId),
      toUserId: toObjectId(payload.toUserId),
      amount: payload.amount,
      currency: "INR",
      note: payload.note,
      settledAt: payload.settledAt ? new Date(payload.settledAt) : new Date(),
      createdBy: toObjectId(userId),
    });

    return Response.json({ settlement }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid settlement input", 422);
    }

    console.error(error);
    return jsonError("Failed to create settlement", 500);
  }
}
