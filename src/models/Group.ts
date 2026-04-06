import { Schema, model, models, type InferSchemaType, Types } from "mongoose";

const memberSchema = new Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "member"],
      required: true,
      default: "member",
    },
    joinedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  {
    _id: false,
  },
);

const groupSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    createdBy: {
      type: Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    inviteCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    members: {
      type: [memberSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

groupSchema.index({ "members.userId": 1 });

export type GroupDocument = InferSchemaType<typeof groupSchema>;

export const Group = models.Group || model("Group", groupSchema);
