import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { resolveAccessibleCategoryId } from "@/lib/category-access";
import { toTransaction, type TransactionRow } from "@/lib/data/mappers";
import { handleRouteError, must, optionalParam, selectAll } from "@/lib/route";

const transactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  title: z.string().trim().min(2).max(100),
  notes: z.string().trim().max(500).optional(),
  amount: z.number().positive(),
  categoryId: z.string().optional(),
  transactionDate: z.string().datetime(),
  recurring: z
    .object({
      enabled: z.boolean(),
      frequency: z.enum(["monthly", "yearly"]).optional(),
      nextRunAt: z.string().datetime().optional(),
    })
    .optional(),
});

const transactionQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  type: z.enum(["income", "expense"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["transactionDate", "amount", "createdAt", "title"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const SORT_COLUMNS = {
  transactionDate: "transaction_date",
  amount: "amount",
  createdAt: "created_at",
  title: "title",
} as const;

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();

    const { searchParams } = new URL(request.url);
    const q = transactionQuerySchema.parse({
      startDate: optionalParam(searchParams.get("startDate")),
      endDate: optionalParam(searchParams.get("endDate")),
      type: optionalParam(searchParams.get("type")),
      page: optionalParam(searchParams.get("page")),
      limit: optionalParam(searchParams.get("limit")),
      sortBy: optionalParam(searchParams.get("sortBy")),
      sortOrder: optionalParam(searchParams.get("sortOrder")),
    });

    const shouldPaginate = q.page !== undefined || q.limit !== undefined;
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;

    // RLS scopes every query here to the caller.
    const build = (from: number, to: number) => {
      let query = supabase.from("transactions").select("*", { count: "exact" });
      if (q.startDate) query = query.gte("transaction_date", q.startDate);
      if (q.endDate) query = query.lte("transaction_date", q.endDate);
      if (q.type) query = query.eq("type", q.type);
      return query
        .order(SORT_COLUMNS[q.sortBy ?? "transactionDate"], { ascending: q.sortOrder === "asc" })
        .order("id")
        .range(from, to);
    };

    const [listResult, totalsResult] = await Promise.all([
      shouldPaginate
        ? build((page - 1) * limit, page * limit - 1).then((result) => ({
            rows: must(result) as TransactionRow[],
            count: result.count,
          }))
        : selectAll<TransactionRow>(build).then((rows) => ({ rows, count: rows.length })),
      supabase.rpc("ledger_type_totals", { p_start: q.startDate ?? null, p_end: q.endDate ?? null }),
    ]);
    const rows = listResult.rows;
    const totals = (must(totalsResult) ?? []) as Array<{ type: string; total: number }>;

    // ledger_type_totals has no type filter; apply it here to match the list.
    const totalOf = (type: string) =>
      q.type && q.type !== type ? 0 : Number(totals.find((t) => t.type === type)?.total ?? 0);
    const totalIncome = totalOf("income");
    const totalExpense = totalOf("expense");
    const totalCount = listResult.count ?? rows.length;

    return Response.json({
      transactions: rows.map(toTransaction),
      summary: { totalIncome, totalExpense, balance: totalIncome - totalExpense },
      pagination: shouldPaginate
        ? {
            page,
            limit,
            totalCount,
            totalPages: Math.max(1, Math.ceil(totalCount / limit)),
            hasNextPage: page * limit < totalCount,
            hasPrevPage: page > 1,
          }
        : null,
    });
  } catch (error) {
    return handleRouteError(error, "Failed to load transactions");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireUser();
    const payload = transactionSchema.parse(await request.json());

    if (payload.recurring?.enabled && !payload.recurring.frequency) {
      return Response.json({ error: "Recurring frequency is required" }, { status: 422 });
    }

    const categoryId = await resolveAccessibleCategoryId(supabase, payload.categoryId);
    const recurringEnabled = payload.recurring?.enabled ?? false;

    const row = must(
      await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          type: payload.type,
          title: payload.title,
          notes: payload.notes ?? null,
          amount: payload.amount,
          category_id: categoryId,
          transaction_date: payload.transactionDate,
          recurring_enabled: recurringEnabled,
          recurring_frequency: payload.recurring?.frequency ?? null,
          recurring_next_run_at: recurringEnabled
            ? (payload.recurring?.nextRunAt ?? payload.transactionDate)
            : null,
        })
        .select()
        .single(),
    ) as TransactionRow;

    await invalidateUsers([userId]);
    return Response.json({ transaction: toTransaction(row) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Failed to create transaction");
  }
}
