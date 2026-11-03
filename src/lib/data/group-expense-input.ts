import { randomUUID } from "node:crypto";

import { z } from "zod";

import { HttpError } from "@/lib/route";
import { computeShares, validatePayers } from "@/lib/split";

/**
 * The body of a group expense, for both creating and editing one. Shares are
 * computed here by lib/split.ts; the SQL write functions then re-check
 * membership and that the parts sum exactly to the total.
 */
export const groupExpenseSchema = z
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
    // Equal: the participants (none listed means everyone). Custom: each
    // person's amount. Percentage: each person's percentage.
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
    // A shared expense category (Food, Travel…), so each member's share
    // counts against their own budget for it.
    categoryId: z.string().uuid().nullable().optional(),
    incurredAt: z.string().datetime().optional(),
  })
  .refine(
    (payload) => (payload.splitType === "itemized") === Boolean(payload.lineItems),
    { message: "Line items are required for an itemized split, and not valid for any other" },
  );

export type GroupExpenseInput = z.infer<typeof groupExpenseSchema>;

/** Validates against the group's members and builds the SQL function's arguments. */
export function toGroupExpenseArgs(payload: GroupExpenseInput, memberIds: string[]) {
  for (const payer of payload.paidBy) {
    if (!memberIds.includes(payer.userId)) {
      throw new HttpError(422, "All payers must belong to the group");
    }
  }

  const splitEntries = payload.splits ?? [];
  const lineItems = payload.lineItems ?? [];

  // The split strategies throw plain Errors with user-facing messages
  // ("Percentage split must total 100", …); surface those as 422s.
  let shares: ReturnType<typeof computeShares>;
  try {
    shares = computeShares(payload.amount, payload.splitType, splitEntries, memberIds, lineItems);
    validatePayers(payload.amount, payload.paidBy);
  } catch (error) {
    throw new HttpError(422, error instanceof Error ? error.message : "Invalid split");
  }

  return {
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
    p_category_id: payload.categoryId ?? null,
  };
}
