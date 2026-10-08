import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { toGoal, type GoalRow } from "@/lib/data/mappers";
import { GOAL_THEMES } from "@/lib/goals";
import { jsonError } from "@/lib/http";
import { roundCurrency } from "@/lib/money";
import { handleRouteError, isUuid, must } from "@/lib/route";

const updateGoalSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  theme: z.enum(GOAL_THEMES).optional(),
  targetAmount: z.number().positive().max(1e12).optional(),
  savedAmount: z.number().min(0).max(1e12).optional(),
  /** Signed: a withdrawal is a negative contribution. Applied after `savedAmount`. */
  contribution: z.number().min(-1e12).max(1e12).optional(),
  targetDate: z.string().datetime().nullable().optional(),
});

type Params = { params: Promise<{ goalId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase, userId } = await requireUser();
    const payload = updateGoalSchema.parse(await request.json());
    const { goalId } = await params;
    if (!isUuid(goalId)) return jsonError("Goal not found", 404);

    const goal = must(
      await supabase.from("goals").select("*").eq("id", goalId).maybeSingle(),
    ) as GoalRow | null;
    if (!goal) return jsonError("Goal not found", 404);

    const targetAmount = payload.targetAmount ?? Number(goal.target_amount);
    let savedAmount = payload.savedAmount ?? Number(goal.saved_amount);
    if (payload.contribution !== undefined) {
      savedAmount = roundCurrency(savedAmount + payload.contribution);
    }
    if (savedAmount < 0) {
      return jsonError("You can't withdraw more than has been saved", 422);
    }

    const wasComplete = Boolean(goal.completed_at);
    const isComplete = savedAmount >= targetAmount;

    const updates: Record<string, unknown> = {
      target_amount: targetAmount,
      saved_amount: savedAmount,
      completed_at: isComplete ? (goal.completed_at ?? new Date().toISOString()) : null,
    };
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.theme !== undefined) updates.theme = payload.theme;
    if (payload.targetDate !== undefined) updates.target_date = payload.targetDate;

    // Contributions read-modify-write saved_amount; matching on the value we
    // read makes a concurrent contribution fail the update instead of being
    // silently overwritten.
    const row = must(
      await supabase
        .from("goals")
        .update(updates)
        .eq("id", goalId)
        .eq("saved_amount", goal.saved_amount)
        .select()
        .maybeSingle(),
    ) as GoalRow | null;
    if (!row) return jsonError("This goal changed in the meantime. Refresh and try again.", 409);

    await invalidateUsers([userId]);
    return Response.json({ goal: toGoal(row), justCompleted: isComplete && !wasComplete });
  } catch (error) {
    return handleRouteError(error, "Failed to update goal");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { supabase, userId } = await requireUser();
    const { goalId } = await params;
    if (!isUuid(goalId)) return jsonError("Goal not found", 404);

    const deleted = must(
      await supabase.from("goals").delete().eq("id", goalId).select("id"),
    ) as Array<{ id: string }>;
    if (!deleted.length) return jsonError("Goal not found", 404);

    await invalidateUsers([userId]);
    return Response.json({ success: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete goal");
  }
}
