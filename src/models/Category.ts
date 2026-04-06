import { Schema, model, models, type InferSchemaType, Types } from "mongoose";

const categorySchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["income", "expense"],
      required: true,
      index: true,
    },
    icon: {
      type: String,
      required: false,
    },
    color: {
      type: String,
      required: false,
    },
    isSystem: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

categorySchema.index({ userId: 1, name: 1, type: 1 }, { unique: true, sparse: true });

export type CategoryDocument = InferSchemaType<typeof categorySchema>;

export const Category = models.Category || model("Category", categorySchema);
