import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { resolveAccessibleCategoryId } from "@/lib/category-access";
import { toBudget, type BudgetRow } from "@/lib/data/mappers";
import { jsonError, parseDate } from "@/lib/http";
import { handleRouteError, must } from "@/lib/route";

const budgetSchema = z.object({
  name: z.string().trim().min(2).max(100),
  amount: z.number().positive(),
  cycle: z.enum(["monthly", "quarterly", "yearly"]),
  categoryId: z.string().optional(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();
    const { searchParams } = new URL(request.url);
    const startDate = parseDate(searchParams.get("startDate"));
    const endDate = parseDate(searchParams.get("endDate"));

    // A budget is relevant to the window if its period overlaps it at all.
    let query = supabase.from("budgets").select("*").order("period_start", { ascending: false });
    if (endDate) query = query.lte("period_start", endDate.toISOString());
    if (startDate) query = query.gte("period_end", startDate.toISOString());

    const rows = must(await query) as BudgetRow[];
    return Response.json({ budgets: rows.map(toBudget) });
  } catch (error) {
    return handleRouteError(error, "Failed to load budgets");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireUser();
    const payload = budgetSchema.parse(await request.json());

    if (new Date(payload.periodEnd) <= new Date(payload.periodStart)) {
      return jsonError("Budget period end must be after period start", 422);
    }

    const categoryId = await resolveAccessibleCategoryId(supabase, payload.categoryId);

    const row = must(
      await supabase
        .from("budgets")
        .insert({
          user_id: userId,
          name: payload.name,
          amount: payload.amount,
          cycle: payload.cycle,
          category_id: categoryId,
          period_start: payload.periodStart,
          period_end: payload.periodEnd,
        })
        .select()
        .single(),
    ) as BudgetRow;

    await invalidateUsers([userId]);
    return Response.json({ budget: toBudget(row) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Failed to create budget");
  }
}
