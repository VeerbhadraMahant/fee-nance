import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { resolveAccessibleCategoryId } from "@/lib/category-access";
import { toTransaction, type TransactionRow } from "@/lib/data/mappers";
import { jsonError } from "@/lib/http";
import { handleRouteError, isUuid, must } from "@/lib/route";

const updateTransactionSchema = z.object({
  type: z.enum(["income", "expense"]).optional(),
  title: z.string().trim().min(2).max(100).optional(),
  notes: z.string().trim().max(500).optional(),
  amount: z.number().positive().optional(),
  categoryId: z.string().nullable().optional(),
  transactionDate: z.string().datetime().optional(),
  recurring: z
    .object({
      enabled: z.boolean(),
      frequency: z.enum(["monthly", "yearly"]).optional(),
      nextRunAt: z.string().datetime().optional(),
    })
    .optional(),
});

type Params = { params: Promise<{ transactionId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase, userId } = await requireUser();
    const payload = updateTransactionSchema.parse(await request.json());
    const { transactionId } = await params;
    if (!isUuid(transactionId)) return jsonError("Transaction not found", 404);

    if (payload.recurring?.enabled && !payload.recurring.frequency) {
      return jsonError("Recurring frequency is required", 422);
    }

    const updates: Record<string, unknown> = {};
    if (payload.type) updates.type = payload.type;
    if (payload.title) updates.title = payload.title;
    if (payload.notes !== undefined) updates.notes = payload.notes;
    if (payload.amount) updates.amount = payload.amount;
    if (payload.transactionDate) updates.transaction_date = payload.transactionDate;
    if (payload.categoryId !== undefined) {
      updates.category_id = await resolveAccessibleCategoryId(supabase, payload.categoryId);
    }
    if (payload.recurring) {
      updates.recurring_enabled = payload.recurring.enabled;
      updates.recurring_frequency = payload.recurring.frequency ?? null;
      updates.recurring_next_run_at = payload.recurring.nextRunAt ?? null;
    }

    // RLS turns someone else's id into zero rows, which is a 404 here.
    const row = must(
      await supabase.from("transactions").update(updates).eq("id", transactionId).select().maybeSingle(),
    ) as TransactionRow | null;
    if (!row) return jsonError("Transaction not found", 404);

    await invalidateUsers([userId]);
    return Response.json({ transaction: toTransaction(row) });
  } catch (error) {
    return handleRouteError(error, "Failed to update transaction", {
      notFoundMessage: "Transaction not found",
    });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { supabase, userId } = await requireUser();
    const { transactionId } = await params;
    if (!isUuid(transactionId)) return jsonError("Transaction not found", 404);

    const deleted = must(
      await supabase.from("transactions").delete().eq("id", transactionId).select("id"),
    ) as Array<{ id: string }>;
    if (!deleted.length) return jsonError("Transaction not found", 404);

    await invalidateUsers([userId]);
    return Response.json({ success: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete transaction");
  }
}
