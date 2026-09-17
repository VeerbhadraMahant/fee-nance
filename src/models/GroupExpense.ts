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

/**
 * One line of an itemized bill. Keeps its own `_id` so the UI can address a
 * row, and records who shared it — provenance for how the split was derived.
 * `splits[].shareAmount` remains the source of truth for balances, exactly as
 * it is for the raw `amount` / `percentage` inputs on the other strategies.
 */
const lineItemSchema = new Schema({
  label: {
    type: String,
    required: true,
    trim: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  sharedBy: {
    type: [{ type: Types.ObjectId, ref: "User" }],
    required: true,
    default: [],
  },
  // Tax, tip or service charge: spread by subtotal rather than evenly.
  proportional: {
    type: Boolean,
    required: false,
    default: false,
  },
});

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
      enum: ["equal", "custom", "percentage", "itemized"],
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
    // Populated only for itemized expenses; empty for every other strategy.
    lineItems: {
      type: [lineItemSchema],
      required: false,
      default: [],
    },
    // Provenance when the line items came from a receipt scan rather than
    // being typed. Absent for manual entry.
    extraction: {
      type: new Schema(
        {
          source: { type: String, required: true },
          confidence: { type: Number, required: false },
          extractedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      required: false,
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
