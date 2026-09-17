import { z } from "zod";
import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { getGroupMemberIds } from "@/lib/group-members";
import { computeShares, validatePayers } from "@/lib/split";
import { jsonError } from "@/lib/http";
import { toObjectId } from "@/lib/object-id";
import { logger } from "@/lib/logger";
import { Group } from "@/models/Group";
import { GroupExpense } from "@/models/GroupExpense";

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

function getOptionalParam(value: string | null) {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  return value;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { groupId } = await params;

    await connectToDatabase();

    const group = await Group.findById(toObjectId(groupId)).lean();

    if (!group) {
      return jsonError("Group not found", 404);
    }

    const memberIds = getGroupMemberIds(group);

    if (!memberIds.includes(userId)) {
      return jsonError("Forbidden", 403);
    }

    const { searchParams } = new URL(request.url);
    const queryParams = expenseQuerySchema.parse({
      startDate: getOptionalParam(searchParams.get("startDate")),
      endDate: getOptionalParam(searchParams.get("endDate")),
      createdBy: getOptionalParam(searchParams.get("createdBy")),
      page: getOptionalParam(searchParams.get("page")),
      limit: getOptionalParam(searchParams.get("limit")),
      sortBy: getOptionalParam(searchParams.get("sortBy")),
      sortOrder: getOptionalParam(searchParams.get("sortOrder")),
    });

    if (queryParams.createdBy && !memberIds.includes(queryParams.createdBy)) {
      return jsonError("createdBy filter must be a group member", 422);
    }

    const shouldPaginate = queryParams.page !== undefined || queryParams.limit !== undefined;
    const page = queryParams.page ?? 1;
    const limit = queryParams.limit ?? 20;
    const sortField = queryParams.sortBy ?? "incurredAt";
    const sortDirection = queryParams.sortOrder === "asc" ? 1 : -1;

    const historyQuery: {
      groupId: ReturnType<typeof toObjectId>;
      incurredAt?: { $gte?: Date; $lte?: Date };
      createdBy?: ReturnType<typeof toObjectId>;
    } = {
      groupId: toObjectId(groupId),
    };

    if (queryParams.startDate || queryParams.endDate) {
      historyQuery.incurredAt = {};
      if (queryParams.startDate) {
        historyQuery.incurredAt.$gte = new Date(queryParams.startDate);
      }
      if (queryParams.endDate) {
        historyQuery.incurredAt.$lte = new Date(queryParams.endDate);
      }
    }

    if (queryParams.createdBy) {
      historyQuery.createdBy = toObjectId(queryParams.createdBy);
    }

    const totalCountPromise = GroupExpense.countDocuments(historyQuery);
    const findQuery = GroupExpense.find(historyQuery).sort({ [sortField]: sortDirection });

    if (shouldPaginate) {
      findQuery.skip((page - 1) * limit).limit(limit);
    }

    const [totalCount, expenses] = await Promise.all([totalCountPromise, findQuery.lean()]);

    return Response.json({
      expenses,
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
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid group expense query", 422);
    }

    if (error instanceof Error && error.message === "Invalid identifier") {
      return jsonError("Invalid identifier", 422);
    }

    logger.error("Unhandled API route error", error);
    return jsonError("Failed to load group expenses", 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const userId = await requireUserId();
    const payload = createExpenseSchema.parse(await request.json());
    const { groupId } = await params;

    await connectToDatabase();

    const group = await Group.findById(toObjectId(groupId));

    if (!group) {
      return jsonError("Group not found", 404);
    }

    const memberIds = getGroupMemberIds(group);

    if (!memberIds.includes(userId)) {
      return jsonError("Forbidden", 403);
    }

    for (const payer of payload.paidBy) {
      if (!memberIds.includes(payer.userId)) {
        return jsonError("All payers must belong to the group", 422);
      }
    }

    const splitEntries = payload.splits ?? [];
    const lineItems = payload.lineItems ?? [];
    const shares = computeShares(
      payload.amount,
      payload.splitType,
      splitEntries,
      memberIds,
      lineItems,
    );
    validatePayers(payload.amount, payload.paidBy);

    const expense = await GroupExpense.create({
      groupId: toObjectId(groupId),
      createdBy: toObjectId(userId),
      title: payload.title,
      notes: payload.notes,
      amount: payload.amount,
      currency: "INR",
      splitType: payload.splitType,
      paidBy: payload.paidBy.map((payer) => ({
        userId: toObjectId(payer.userId),
        amount: payer.amount,
      })),
      splits: shares.map((share) => {
        const splitDetails = splitEntries.find((split) => split.userId === share.userId);

        return {
          userId: toObjectId(share.userId),
          amount: splitDetails?.amount,
          percentage: splitDetails?.percentage,
          shareAmount: share.shareAmount,
        };
      }),
      lineItems: lineItems.map((item) => ({
        label: item.label,
        amount: item.amount,
        sharedBy: item.sharedBy.map((userId) => toObjectId(userId)),
        proportional: item.proportional ?? false,
      })),
      incurredAt: payload.incurredAt ? new Date(payload.incurredAt) : new Date(),
    });

    return Response.json({ expense }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid group expense input", 422);
    }

    if (error instanceof Error && error.message === "Invalid identifier") {
      return jsonError("Invalid identifier", 422);
    }

    if (error instanceof Error) {
      return jsonError(error.message, 422);
    }

    logger.error("Unhandled API route error", error);
    return jsonError("Failed to create group expense", 500);
  }
}
