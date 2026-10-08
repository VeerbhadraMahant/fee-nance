import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { resolveAccessibleCategoryId } from "@/lib/category-access";
import { toBudget, type BudgetRow } from "@/lib/data/mappers";
import { jsonError } from "@/lib/http";
import { handleRouteError, isUuid, must } from "@/lib/route";

const updateBudgetSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  amount: z.number().positive().optional(),
  cycle: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  categoryId: z.string().nullable().optional(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
});

type Params = { params: Promise<{ budgetId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase, userId } = await requireUser();
    const payload = updateBudgetSchema.parse(await request.json());
    const { budgetId } = await params;
    if (!isUuid(budgetId)) return jsonError("Budget not found", 404);

    const current = must(
      await supabase.from("budgets").select("period_start, period_end").eq("id", budgetId).maybeSingle(),
    ) as Pick<BudgetRow, "period_start" | "period_end"> | null;
    if (!current) return jsonError("Budget not found", 404);

    const periodStart = payload.periodStart ?? current.period_start;
    const periodEnd = payload.periodEnd ?? current.period_end;
    if (new Date(periodEnd) <= new Date(periodStart)) {
      return jsonError("Budget period end must be after period start", 422);
    }

    const updates: Record<string, unknown> = { period_start: periodStart, period_end: periodEnd };
    if (payload.name) updates.name = payload.name;
    if (payload.amount) updates.amount = payload.amount;
    if (payload.cycle) updates.cycle = payload.cycle;
    if (payload.categoryId !== undefined) {
      updates.category_id = await resolveAccessibleCategoryId(supabase, payload.categoryId);
    }

    const row = must(
      await supabase.from("budgets").update(updates).eq("id", budgetId).select().single(),
    ) as BudgetRow;

    await invalidateUsers([userId]);
    return Response.json({ budget: toBudget(row) });
  } catch (error) {
    return handleRouteError(error, "Failed to update budget");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { supabase, userId } = await requireUser();
    const { budgetId } = await params;
    if (!isUuid(budgetId)) return jsonError("Budget not found", 404);

    const deleted = must(
      await supabase.from("budgets").delete().eq("id", budgetId).select("id"),
    ) as Array<{ id: string }>;
    if (!deleted.length) return jsonError("Budget not found", 404);

    await invalidateUsers([userId]);
    return Response.json({ success: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete budget");
  }
}
