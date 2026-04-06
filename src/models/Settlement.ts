import { Schema, model, models, type InferSchemaType, Types } from "mongoose";

const settlementSchema = new Schema(
  {
    groupId: {
      type: Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    fromUserId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    toUserId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
      enum: ["INR"],
    },
    note: {
      type: String,
      required: false,
    },
    settledAt: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
    createdBy: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

settlementSchema.index({ groupId: 1, settledAt: -1 });

export type SettlementDocument = InferSchemaType<typeof settlementSchema>;

export const Settlement = models.Settlement || model("Settlement", settlementSchema);
