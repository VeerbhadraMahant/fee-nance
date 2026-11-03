import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { groupExpenseSchema, toGroupExpenseArgs } from "@/lib/data/group-expense-input";
import { loadGroup, memberIdsOf } from "@/lib/data/groups";
import { GROUP_EXPENSE_SELECT, toGroupExpense, type GroupExpenseRow } from "@/lib/data/mappers";
import { jsonError } from "@/lib/http";
import { handleRouteError, must, optionalParam } from "@/lib/route";

const expenseQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  createdBy: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["incurredAt", "amount", "createdAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const SORT_COLUMNS = {
  incurredAt: "incurred_at",
  amount: "amount",
  createdAt: "created_at",
} as const;

type Params = { params: Promise<{ groupId: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireUser();
    const { groupId } = await params;

    const group = await loadGroup(supabase, groupId);
    if (!group) return jsonError("Group not found", 404);
    const memberIds = memberIdsOf(group);

    const { searchParams } = new URL(request.url);
    const q = expenseQuerySchema.parse({
      startDate: optionalParam(searchParams.get("startDate")),
      endDate: optionalParam(searchParams.get("endDate")),
      createdBy: optionalParam(searchParams.get("createdBy")),
      page: optionalParam(searchParams.get("page")),
      limit: optionalParam(searchParams.get("limit")),
      sortBy: optionalParam(searchParams.get("sortBy")),
      sortOrder: optionalParam(searchParams.get("sortOrder")),
    });

    if (q.createdBy && !memberIds.includes(q.createdBy)) {
      return jsonError("createdBy filter must be a group member", 422);
    }

    const shouldPaginate = q.page !== undefined || q.limit !== undefined;
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;

    let query = supabase
      .from("group_expenses")
      .select(GROUP_EXPENSE_SELECT, { count: "exact" })
      .eq("group_id", groupId)
      .order(SORT_COLUMNS[q.sortBy ?? "incurredAt"], { ascending: q.sortOrder === "asc" });
    if (q.startDate) query = query.gte("incurred_at", q.startDate);
    if (q.endDate) query = query.lte("incurred_at", q.endDate);
    if (q.createdBy) query = query.eq("created_by", q.createdBy);
    if (shouldPaginate) query = query.range((page - 1) * limit, page * limit - 1);

    const result = await query;
    const rows = must(result) as GroupExpenseRow[];
    const totalCount = result.count ?? rows.length;

    return Response.json({
      expenses: rows.map(toGroupExpense),
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
    return handleRouteError(error, "Failed to load group expenses");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { supabase } = await requireUser();
    const payload = groupExpenseSchema.parse(await request.json());
    const { groupId } = await params;

    const group = await loadGroup(supabase, groupId);
    if (!group) return jsonError("Group not found", 404);
    const memberIds = memberIdsOf(group);

    // Expense, payers and splits are written in one transaction by the SQL
    // function, which re-checks membership and that the parts sum to the total.
    const expenseId = must(
      await supabase.rpc("create_group_expense", {
        p_group_id: groupId,
        ...toGroupExpenseArgs(payload, memberIds),
        p_incurred_at: payload.incurredAt ?? new Date().toISOString(),
        p_client_key: payload.clientKey ?? null,
      }),
    ) as string;

    const row = must(
      await supabase.from("group_expenses").select(GROUP_EXPENSE_SELECT).eq("id", expenseId).single(),
    ) as GroupExpenseRow;

    await invalidateUsers(memberIds);
    return Response.json({ expense: toGroupExpense(row) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Failed to create group expense");
  }
}
