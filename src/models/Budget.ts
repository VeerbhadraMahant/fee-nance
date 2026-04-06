import { Schema, model, models, type InferSchemaType, Types } from "mongoose";

const budgetSchema = new Schema(
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
    cycle: {
      type: String,
      enum: ["monthly", "quarterly", "yearly"],
      required: true,
      index: true,
    },
    categoryId: {
      type: Types.ObjectId,
      ref: "Category",
      required: false,
      index: true,
    },
    periodStart: {
      type: Date,
      required: true,
      index: true,
    },
    periodEnd: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

budgetSchema.index({ userId: 1, cycle: 1, periodStart: 1 });

export type BudgetDocument = InferSchemaType<typeof budgetSchema>;

export const Budget = models.Budget || model("Budget", budgetSchema);
