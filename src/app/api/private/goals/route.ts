import { z } from "zod";

import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { GOAL_THEMES } from "@/lib/goals";
import { jsonError } from "@/lib/http";
import { averageSurplus, completedMonthTotals } from "@/lib/ledger-stats";
import { logger } from "@/lib/logger";
import { toObjectId } from "@/lib/object-id";
import { Goal } from "@/models/Goal";

const createGoalSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    theme: z.enum(GOAL_THEMES).default("general"),
    targetAmount: z.number().positive().max(1e12),
    savedAmount: z.number().min(0).max(1e12).default(0),
    targetDate: z.string().datetime().nullable().optional(),
  })
  .refine((goal) => goal.savedAmount <= goal.targetAmount, {
    message: "Saved amount can't exceed the target",
    path: ["savedAmount"],
  });

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectToDatabase();
    const userObjectId = toObjectId(userId);

    const [goals, stats] = await Promise.all([
      Goal.find({ userId: userObjectId }).sort({ completedAt: 1, createdAt: -1 }).lean(),
      completedMonthTotals(userObjectId, 3),
    ]);

    return Response.json({
      goals,
      // What the ledger says the user actually puts aside each month. The page
      // sets each goal's projection against this, so the numbers stay honest
      // when several goals compete for the same surplus.
      monthlySurplus: averageSurplus(stats.months),
      surplusMonths: stats.months.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    logger.error("Unhandled API route error", error);
    return jsonError("Failed to load goals", 500);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = createGoalSchema.parse(await request.json());

    await connectToDatabase();

    const goal = await Goal.create({
      userId: toObjectId(userId),
      name: payload.name,
      theme: payload.theme,
      targetAmount: payload.targetAmount,
      savedAmount: payload.savedAmount,
      currency: "INR",
      targetDate: payload.targetDate ? new Date(payload.targetDate) : undefined,
      completedAt: payload.savedAmount >= payload.targetAmount ? new Date() : undefined,
    });

    return Response.json({ goal }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid goal input", 422);
    }

    logger.error("Unhandled API route error", error);
    return jsonError("Failed to create goal", 500);
  }
}
