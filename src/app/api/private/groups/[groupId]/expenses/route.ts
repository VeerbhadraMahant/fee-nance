import { z } from "zod";
import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { computeShares, validatePayers } from "@/lib/split";
import { jsonError } from "@/lib/http";
import { toObjectId } from "@/lib/object-id";
import { Group } from "@/models/Group";
import { GroupExpense } from "@/models/GroupExpense";

const createExpenseSchema = z.object({
  title: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(500).optional(),
  amount: z.number().positive(),
  splitType: z.enum(["equal", "custom", "percentage"]),
  paidBy: z.array(
    z.object({
      userId: z.string(),
      amount: z.number().positive(),
    }),
  ),
  splits: z
    .array(
      z.object({
        userId: z.string(),
        amount: z.number().positive().optional(),
        percentage: z.number().positive().optional(),
      }),
    )
    .optional(),
  incurredAt: z.string().datetime().optional(),
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

    const expenses = await GroupExpense.find({
      groupId: toObjectId(groupId),
    })
      .sort({ incurredAt: -1 })
      .lean();

    return Response.json({ expenses });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    console.error(error);
    return jsonError("Failed to load group expenses", 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const userId = await requireUserId();
    const payload = createExpenseSchema.parse(await request.json());
    const { groupId } = await params;

    await connectToDatabase();

    const group = await Group.findById(toObjectId(groupId));

    if (!group) {
      return jsonError("Group not found", 404);
    }

    const memberIds = group.members.map((member: { userId: { toString(): string } }) =>
      member.userId.toString(),
    );

    if (!memberIds.includes(userId)) {
      return jsonError("Forbidden", 403);
    }

    for (const payer of payload.paidBy) {
      if (!memberIds.includes(payer.userId)) {
        return jsonError("All payers must belong to the group", 422);
      }
    }

    const splitEntries = payload.splits ?? [];
    const shares = computeShares(payload.amount, payload.splitType, splitEntries, memberIds);
    validatePayers(payload.amount, payload.paidBy);

    const expense = await GroupExpense.create({
      groupId: toObjectId(groupId),
      createdBy: toObjectId(userId),
      title: payload.title,
      notes: payload.notes,
      amount: payload.amount,
      currency: "INR",
      splitType: payload.splitType,
      paidBy: payload.paidBy.map((payer) => ({
        userId: toObjectId(payer.userId),
        amount: payer.amount,
      })),
      splits: shares.map((share) => {
        const splitDetails = splitEntries.find((split) => split.userId === share.userId);

        return {
          userId: toObjectId(share.userId),
          amount: splitDetails?.amount,
          percentage: splitDetails?.percentage,
          shareAmount: share.shareAmount,
        };
      }),
      incurredAt: payload.incurredAt ? new Date(payload.incurredAt) : new Date(),
    });

    return Response.json({ expense }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid group expense input", 422);
    }

    if (error instanceof Error) {
      return jsonError(error.message, 422);
    }

    console.error(error);
    return jsonError("Failed to create group expense", 500);
  }
}
