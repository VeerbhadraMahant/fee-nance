import { z } from "zod";
import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { isMongoDuplicateKeyError } from "@/lib/mongo-errors";
import { toObjectId } from "@/lib/object-id";
import { logger } from "@/lib/logger";
import { Budget } from "@/models/Budget";
import { Category } from "@/models/Category";
import { Transaction } from "@/models/Transaction";

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(50).optional(),
    type: z.enum(["income", "expense"]).optional(),
    icon: z.string().trim().min(1).max(40).optional(),
    color: z.string().trim().min(4).max(20).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.type !== undefined ||
      value.icon !== undefined ||
      value.color !== undefined,
    {
      message: "At least one field is required",
    },
  );

function canManageCategory(category: { isSystem: boolean; userId?: { toString(): string } }, userId: string) {
  if (category.isSystem) {
    return false;
  }

  return category.userId?.toString() === userId;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  try {
    const userId = await requireUserId();
    const payload = updateCategorySchema.parse(await request.json());
    const { categoryId } = await params;

    await connectToDatabase();

    const category = await Category.findById(toObjectId(categoryId));

    if (!category) {
      return jsonError("Category not found", 404);
    }

    if (!canManageCategory(category, userId)) {
      return jsonError("Cannot edit system or external category", 403);
    }

    if (payload.name !== undefined) {
      category.name = payload.name;
    }

    if (payload.type !== undefined) {
      category.type = payload.type;
    }

    if (payload.icon !== undefined) {
      category.icon = payload.icon;
    }

    if (payload.color !== undefined) {
      category.color = payload.color;
    }

    await category.save();

    return Response.json({ category });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid category update", 422);
    }

    if (isMongoDuplicateKeyError(error)) {
      return jsonError("Category with this name and type already exists", 409);
    }

    if (error instanceof Error) {
      return jsonError(error.message, 422);
    }

    logger.error("Unhandled API route error", error);
    return jsonError("Failed to update category", 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  try {
    const userId = await requireUserId();
    const { categoryId } = await params;

    await connectToDatabase();

    const category = await Category.findById(toObjectId(categoryId));

    if (!category) {
      return jsonError("Category not found", 404);
    }

    if (!canManageCategory(category, userId)) {
      return jsonError("Cannot delete system or external category", 403);
    }

    // Categories are referenced by transactions and budgets; deleting one
    // out from under them would leave a dangling ObjectId, so clear the
    // reference on both rather than cascading the delete.
    await Promise.all([
      Category.deleteOne({ _id: category._id }),
      Transaction.updateMany(
        { userId: toObjectId(userId), categoryId: category._id },
        { $unset: { categoryId: "" } },
      ),
      Budget.updateMany(
        { userId: toObjectId(userId), categoryId: category._id },
        { $unset: { categoryId: "" } },
      ),
    ]);

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof Error) {
      return jsonError(error.message, 422);
    }

    logger.error("Unhandled API route error", error);
    return jsonError("Failed to delete category", 500);
  }
}
