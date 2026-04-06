import { Schema, model, models, type InferSchemaType, Types } from "mongoose";

const payerSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  },
);

const splitSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: false,
    },
    percentage: {
      type: Number,
      required: false,
    },
    shareAmount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  },
);

const groupExpenseSchema = new Schema(
  {
    groupId: {
      type: Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    createdBy: {
      type: Types.ObjectId,
      ref: "User",
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
    splitType: {
      type: String,
      enum: ["equal", "custom", "percentage"],
      required: true,
      index: true,
    },
    paidBy: {
      type: [payerSchema],
      required: true,
      default: [],
    },
    splits: {
      type: [splitSchema],
      required: true,
      default: [],
    },
    incurredAt: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

groupExpenseSchema.index({ groupId: 1, incurredAt: -1 });

export type GroupExpenseDocument = InferSchemaType<typeof groupExpenseSchema>;

export const GroupExpense =
  models.GroupExpense || model("GroupExpense", groupExpenseSchema);
