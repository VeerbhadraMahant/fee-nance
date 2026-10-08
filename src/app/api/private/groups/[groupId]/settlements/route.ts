import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { loadGroup, memberIdsOf } from "@/lib/data/groups";
import { toSettlement, type SettlementRow } from "@/lib/data/mappers";
import { jsonError } from "@/lib/http";
import { DbQueryError, handleRouteError, must, optionalParam } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

const settlementSchema = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  amount: z.number().positive(),
  note: z.string().trim().max(500).optional(),
  settledAt: z.string().datetime().optional(),
});

const settlementQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  fromUserId: z.string().optional(),
  toUserId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["settledAt", "amount", "createdAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/);

const SORT_COLUMNS = {
  settledAt: "settled_at",
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
    const q = settlementQuerySchema.parse({
      startDate: optionalParam(searchParams.get("startDate")),
      endDate: optionalParam(searchParams.get("endDate")),
      fromUserId: optionalParam(searchParams.get("fromUserId")),
      toUserId: optionalParam(searchParams.get("toUserId")),
      page: optionalParam(searchParams.get("page")),
      limit: optionalParam(searchParams.get("limit")),
      sortBy: optionalParam(searchParams.get("sortBy")),
      sortOrder: optionalParam(searchParams.get("sortOrder")),
    });

    if (q.fromUserId && !memberIds.includes(q.fromUserId)) {
      return jsonError("fromUserId filter must be a group member", 422);
    }
    if (q.toUserId && !memberIds.includes(q.toUserId)) {
      return jsonError("toUserId filter must be a group member", 422);
    }

    const shouldPaginate = q.page !== undefined || q.limit !== undefined;
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;

    let query = supabase
      .from("settlements")
      .select("*", { count: "exact" })
      .eq("group_id", groupId)
      .order(SORT_COLUMNS[q.sortBy ?? "settledAt"], { ascending: q.sortOrder === "asc" });
    if (q.startDate) query = query.gte("settled_at", q.startDate);
    if (q.endDate) query = query.lte("settled_at", q.endDate);
    if (q.fromUserId) query = query.eq("from_user_id", q.fromUserId);
    if (q.toUserId) query = query.eq("to_user_id", q.toUserId);
    if (shouldPaginate) query = query.range((page - 1) * limit, page * limit - 1);

    const result = await query;
    const rows = must(result) as SettlementRow[];
    const totalCount = result.count ?? rows.length;

    return Response.json({
      settlements: rows.map(toSettlement),
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
    return handleRouteError(error, "Failed to load settlements");
  }
}

async function findByIdempotencyKey(
  supabase: SupabaseServerClient,
  groupId: string,
  userId: string,
  key: string,
) {
  return must(
    await supabase
      .from("settlements")
      .select("*")
      .eq("group_id", groupId)
      .eq("created_by", userId)
      .eq("idempotency_key", key)
      .maybeSingle(),
  ) as SettlementRow | null;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { supabase, userId } = await requireUser();
    const payload = settlementSchema.parse(await request.json());
    const { groupId } = await params;
    const idempotencyKeyRaw =
      request.headers.get("x-idempotency-key") ?? request.headers.get("idempotency-key");
    const idempotencyKey = idempotencyKeyRaw ? idempotencyKeySchema.parse(idempotencyKeyRaw) : undefined;

    if (payload.fromUserId === payload.toUserId) {
      return jsonError("Settlement users must be different", 422);
    }

    const group = await loadGroup(supabase, groupId);
    if (!group) return jsonError("Group not found", 404);
    const memberIds = memberIdsOf(group);

    if (!memberIds.includes(payload.fromUserId) || !memberIds.includes(payload.toUserId)) {
      return jsonError("Settlement users must belong to the group", 422);
    }

    if (idempotencyKey) {
      const existing = await findByIdempotencyKey(supabase, groupId, userId, idempotencyKey);
      if (existing) return Response.json({ settlement: toSettlement(existing), idempotent: true });
    }

    try {
      const row = must(
        await supabase
          .from("settlements")
          .insert({
            group_id: groupId,
            from_user_id: payload.fromUserId,
            to_user_id: payload.toUserId,
            amount: payload.amount,
            note: payload.note ?? null,
            settled_at: payload.settledAt ?? new Date().toISOString(),
            created_by: userId,
            idempotency_key: idempotencyKey ?? null,
          })
          .select()
          .single(),
      ) as SettlementRow;

      await invalidateUsers(memberIds);
      return Response.json({ settlement: toSettlement(row) }, { status: 201 });
    } catch (error) {
      // Two retries racing past the lookup above: the unique index lets one
      // through; the other returns what the winner wrote.
      if (idempotencyKey && error instanceof DbQueryError && error.db.code === "23505") {
        const existing = await findByIdempotencyKey(supabase, groupId, userId, idempotencyKey);
        if (existing) return Response.json({ settlement: toSettlement(existing), idempotent: true });
      }
      throw error;
    }
  } catch (error) {
    return handleRouteError(error, "Failed to create settlement");
  }
}
