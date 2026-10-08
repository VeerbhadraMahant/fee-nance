import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { toGoal, type GoalRow } from "@/lib/data/mappers";
import { GOAL_THEMES } from "@/lib/goals";
import { averageSurplus, completedMonthTotals } from "@/lib/ledger-stats";
import { handleRouteError, must } from "@/lib/route";

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
    const { supabase } = await requireUser();

    const [goalsResult, stats] = await Promise.all([
      supabase
        .from("goals")
        .select("*")
        // Unfinished goals first (completed_at null sorts first ascending), newest first within.
        .order("completed_at", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: false }),
      completedMonthTotals(supabase, 3),
    ]);
    const goals = must(goalsResult) as GoalRow[];

    return Response.json({
      goals: goals.map(toGoal),
      // What the ledger says the user actually puts aside each month. The page
      // sets each goal's projection against this, so the numbers stay honest
      // when several goals compete for the same surplus.
      monthlySurplus: averageSurplus(stats.months),
      surplusMonths: stats.months.length,
    });
  } catch (error) {
    return handleRouteError(error, "Failed to load goals");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireUser();
    const payload = createGoalSchema.parse(await request.json());

    const row = must(
      await supabase
        .from("goals")
        .insert({
          user_id: userId,
          name: payload.name,
          theme: payload.theme,
          target_amount: payload.targetAmount,
          saved_amount: payload.savedAmount,
          target_date: payload.targetDate ?? null,
          completed_at: payload.savedAmount >= payload.targetAmount ? new Date().toISOString() : null,
        })
        .select()
        .single(),
    ) as GoalRow;

    await invalidateUsers([userId]);
    return Response.json({ goal: toGoal(row) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Failed to create goal");
  }
}
