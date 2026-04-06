import { z } from "zod";
import { requireUserId } from "@/lib/api-auth";
import { connectToDatabase } from "@/lib/db";
import { ensureDefaultCategories } from "@/lib/default-categories";
import { jsonError } from "@/lib/http";
import { toObjectId } from "@/lib/object-id";
import { Category } from "@/models/Category";

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(50),
  type: z.enum(["income", "expense"]),
  icon: z.string().trim().min(1).max(40).optional(),
  color: z.string().trim().min(4).max(20).optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();
    await connectToDatabase();
    await ensureDefaultCategories();

    const categories = await Category.find({
      $or: [{ isSystem: true }, { userId: toObjectId(userId) }],
    })
      .sort({ isSystem: -1, name: 1 })
      .lean();

    return Response.json({ categories });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    console.error(error);
    return jsonError("Failed to load categories", 500);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const payload = createCategorySchema.parse(await request.json());

    await connectToDatabase();

    const category = await Category.create({
      userId: toObjectId(userId),
      name: payload.name,
      type: payload.type,
      icon: payload.icon,
      color: payload.color,
      isSystem: false,
    });

    return Response.json({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized", 401);
    }

    if (error instanceof z.ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid category input", 422);
    }

    console.error(error);
    return jsonError("Failed to create category", 500);
  }
}
