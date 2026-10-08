import { randomUUID } from "node:crypto";

import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { loadGroup, memberIdsOf } from "@/lib/data/groups";
import { GROUP_EXPENSE_SELECT, toGroupExpense, type GroupExpenseRow } from "@/lib/data/mappers";
import { jsonError } from "@/lib/http";
import { handleRouteError, HttpError, must, optionalParam } from "@/lib/route";
import { computeShares, validatePayers } from "@/lib/split";

const createExpenseSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    notes: z.string().trim().max(500).optional(),
    amount: z.number().positive(),
    splitType: z.enum(["equal", "custom", "percentage", "itemized"]),
    paidBy: z.array(
      z.object({
        userId: z.string(),
        amount: z.number().positive(),
      }),
    ),
    splits: z
      .array(
        z.object({
          userId: z.string(),
          amount: z.number().positive().optional(),
          percentage: z.number().positive().optional(),
        }),
      )
      .optional(),
    lineItems: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(80),
          amount: z.number().positive(),
          sharedBy: z.array(z.string()).min(1),
          proportional: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(60)
      .optional(),
    incurredAt: z.string().datetime().optional(),
  })
  .refine(
    (payload) => (payload.splitType === "itemized") === Boolean(payload.lineItems),
    { message: "Line items are required for an itemized split, and not valid for any other" },
  );

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
    const payload = createExpenseSchema.parse(await request.json());
    const { groupId } = await params;

    const group = await loadGroup(supabase, groupId);
    if (!group) return jsonError("Group not found", 404);
    const memberIds = memberIdsOf(group);

    for (const payer of payload.paidBy) {
      if (!memberIds.includes(payer.userId)) {
        return jsonError("All payers must belong to the group", 422);
      }
    }

    const splitEntries = payload.splits ?? [];
    const lineItems = payload.lineItems ?? [];

    // The split strategies throw plain Errors with user-facing messages
    // ("Percentages must add up to 100", …); surface those as 422s.
    let shares: ReturnType<typeof computeShares>;
    try {
      shares = computeShares(payload.amount, payload.splitType, splitEntries, memberIds, lineItems);
      validatePayers(payload.amount, payload.paidBy);
    } catch (error) {
      throw new HttpError(422, error instanceof Error ? error.message : "Invalid split");
    }

    // Expense, payers and splits are written in one transaction by the SQL
    // function, which re-checks membership and that the parts sum to the total.
    const expenseId = must(
      await supabase.rpc("create_group_expense", {
        p_group_id: groupId,
        p_title: payload.title,
        p_notes: payload.notes ?? null,
        p_amount: payload.amount,
        p_split_type: payload.splitType,
        p_payers: payload.paidBy,
        p_splits: shares.map((share) => {
          const input = splitEntries.find((split) => split.userId === share.userId);
          return {
            userId: share.userId,
            amount: input?.amount ?? null,
            percentage: input?.percentage ?? null,
            shareAmount: share.shareAmount,
          };
        }),
        p_line_items: lineItems.map((item) => ({
          _id: randomUUID(),
          label: item.label,
          amount: item.amount,
          sharedBy: item.sharedBy,
          proportional: item.proportional ?? false,
        })),
        p_incurred_at: payload.incurredAt ?? new Date().toISOString(),
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
