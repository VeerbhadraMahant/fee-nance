import { Schema, model, models, type InferSchemaType, Types } from "mongoose";

import { GOAL_THEMES } from "@/lib/goals";

/**
 * A savings target. `savedAmount` is maintained by the user through
 * contributions rather than derived from the ledger: money set aside for a
 * goal usually still sits in the same account as everything else, so there
 * is no transaction that says "this rupee belongs to the trip".
 */
const goalSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    /** Short preset key that picks the card's icon and accent. */
    theme: {
      type: String,
      enum: [...GOAL_THEMES],
      default: "general",
    },
    targetAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    savedAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
      enum: ["INR"],
    },
    targetDate: {
      type: Date,
      required: false,
    },
    completedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  },
);

goalSchema.index({ userId: 1, createdAt: -1 });

export type GoalDocument = InferSchemaType<typeof goalSchema>;

export const Goal = models.Goal || model("Goal", goalSchema);
