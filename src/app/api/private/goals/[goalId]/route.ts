import { z } from "zod";

import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { GOAL_THEMES } from "@/lib/goals";
import { jsonError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { roundCurrency } from "@/lib/money";
import { toObjectId } from "@/lib/object-id";
import { Goal } from "@/models/Goal";

const updateGoalSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  theme: z.enum(GOAL_THEMES).optional(),
  targetAmount: z.number().positive().max(1e12).optional(),
  savedAmount: z.number().min(0).max(1e12).optional(),
  /** Signed: a withdrawal is a negative contribution. Applied after `savedAmount`. */
  contribution: z.number().min(-1e12).max(1e12).optional(),
  targetDate: z.string().datetime().nullable().optional(),
});

function handleError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return jsonError("Unauthorized", 401);
  }
  if (error instanceof Error && error.message === "Invalid identifier") {
    return jsonError("Goal not found", 404);
  }
  if (error instanceof z.ZodError) {
    return jsonError(error.issues[0]?.message ?? "Invalid goal input", 422);
  }

  logger.error("Unhandled API route error", error);
  return jsonError(fallback, 500);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ goalId: string }> },
) {
  try {
    const userId = await requireUserId();
    const payload = updateGoalSchema.parse(await request.json());
    const { goalId } = await params;

    await connectToDatabase();

    // Ownership is part of the filter, so someone else's goal is a plain 404.
    const goal = await Goal.findOne({ _id: toObjectId(goalId), userId: toObjectId(userId) });
    if (!goal) {
      return jsonError("Goal not found", 404);
    }

    if (payload.name !== undefined) goal.name = payload.name;
    if (payload.theme !== undefined) goal.theme = payload.theme;
    if (payload.targetAmount !== undefined) goal.targetAmount = payload.targetAmount;
    if (payload.savedAmount !== undefined) goal.savedAmount = payload.savedAmount;
    if (payload.contribution !== undefined) {
      goal.savedAmount = roundCurrency(goal.savedAmount + payload.contribution);
    }
    if (payload.targetDate !== undefined) {
      goal.targetDate = payload.targetDate ? new Date(payload.targetDate) : undefined;
    }

    if (goal.savedAmount < 0) {
      return jsonError("You can't withdraw more than has been saved", 422);
    }

    const wasComplete = Boolean(goal.completedAt);
    const isComplete = goal.savedAmount >= goal.targetAmount;
    if (isComplete && !wasComplete) goal.completedAt = new Date();
    if (!isComplete && wasComplete) goal.completedAt = undefined;

    await goal.save();

    return Response.json({ goal, justCompleted: isComplete && !wasComplete });
  } catch (error) {
    return handleError(error, "Failed to update goal");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ goalId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { goalId } = await params;

    await connectToDatabase();

    const deleted = await Goal.findOneAndDelete({
      _id: toObjectId(goalId),
      userId: toObjectId(userId),
    });

    if (!deleted) {
      return jsonError("Goal not found", 404);
    }

    return Response.json({ success: true });
  } catch (error) {
    return handleError(error, "Failed to delete goal");
  }
}
