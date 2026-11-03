import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { resolveAccessibleCategoryId } from "@/lib/category-access";
import { toTransaction, type TransactionRow } from "@/lib/data/mappers";
import { jsonError } from "@/lib/http";
import { firstRunAfter } from "@/lib/recurrence";
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
      updates.recurring_next_run_at = null;

      const frequency = payload.recurring.frequency;
      if (payload.recurring.enabled && frequency) {
        const current = must(
          await supabase
            .from("transactions")
            .select("transaction_date, recurring_enabled, recurring_frequency, recurring_next_run_at")
            .eq("id", transactionId)
            .maybeSingle(),
        ) as Pick<
          TransactionRow,
          "transaction_date" | "recurring_enabled" | "recurring_frequency" | "recurring_next_run_at"
        > | null;
        if (!current) return jsonError("Transaction not found", 404);

        const ruleDate = new Date(payload.transactionDate ?? current.transaction_date);
        // An edit that leaves the schedule alone keeps its place in it, so
        // already generated occurrences aren't revisited.
        const scheduleUnchanged =
          current.recurring_enabled &&
          current.recurring_frequency === frequency &&
          ruleDate.getTime() === new Date(current.transaction_date).getTime() &&
          current.recurring_next_run_at !== null;

        updates.recurring_next_run_at = payload.recurring.nextRunAt
          ? firstRunAfter(ruleDate, frequency, new Date(payload.recurring.nextRunAt)).toISOString()
          : scheduleUnchanged
            ? current.recurring_next_run_at
            : firstRunAfter(ruleDate, frequency).toISOString();
      }
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
