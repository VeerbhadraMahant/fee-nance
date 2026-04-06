import { Schema, model, models, type InferSchemaType, Types } from "mongoose";

const recurringSchema = new Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    frequency: {
      type: String,
      enum: ["monthly", "yearly"],
      required: false,
    },
    nextRunAt: {
      type: Date,
      required: false,
    },
  },
  {
    _id: false,
  },
);

const transactionSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["income", "expense"],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      required: false,
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
    categoryId: {
      type: Types.ObjectId,
      ref: "Category",
      required: false,
      index: true,
    },
    transactionDate: {
      type: Date,
      required: true,
      index: true,
    },
    recurring: {
      type: recurringSchema,
      required: true,
      default: () => ({ enabled: false }),
    },
  },
  {
    timestamps: true,
  },
);

transactionSchema.index({ userId: 1, transactionDate: -1 });

export type TransactionDocument = InferSchemaType<typeof transactionSchema>;

export const Transaction = models.Transaction || model("Transaction", transactionSchema);
