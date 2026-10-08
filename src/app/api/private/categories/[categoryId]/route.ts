import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { toCategory, type CategoryRow } from "@/lib/data/mappers";
import { jsonError } from "@/lib/http";
import { handleRouteError, isUuid, must } from "@/lib/route";

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
    { message: "At least one field is required" },
  );

type Params = { params: Promise<{ categoryId: string }> };

/**
 * Tells "you can't touch this" (a system category, visible but read-only)
 * apart from "no such category" (missing, or someone else's — RLS hides it).
 */
async function loadCategory(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  categoryId: string,
) {
  if (!isUuid(categoryId)) return null;
  return must(
    await supabase.from("categories").select("*").eq("id", categoryId).maybeSingle(),
  ) as CategoryRow | null;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase, userId } = await requireUser();
    const payload = updateCategorySchema.parse(await request.json());
    const { categoryId } = await params;

    const category = await loadCategory(supabase, categoryId);
    if (!category) return jsonError("Category not found", 404);
    if (category.is_system) return jsonError("Cannot edit system or external category", 403);

    const row = must(
      await supabase
        .from("categories")
        .update({
          ...(payload.name !== undefined && { name: payload.name }),
          ...(payload.type !== undefined && { type: payload.type }),
          ...(payload.icon !== undefined && { icon: payload.icon }),
          ...(payload.color !== undefined && { color: payload.color }),
        })
        .eq("id", categoryId)
        .select()
        .single(),
    ) as CategoryRow;

    await invalidateUsers([userId]);
    return Response.json({ category: toCategory(row) });
  } catch (error) {
    return handleRouteError(error, "Failed to update category", {
      conflictMessage: "Category with this name and type already exists",
    });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { supabase, userId } = await requireUser();
    const { categoryId } = await params;

    const category = await loadCategory(supabase, categoryId);
    if (!category) return jsonError("Category not found", 404);
    if (category.is_system) return jsonError("Cannot delete system or external category", 403);

    // Transactions and budgets that used it become uncategorised via the
    // foreign keys' ON DELETE SET NULL — nothing is left dangling.
    must(await supabase.from("categories").delete().eq("id", categoryId));

    await invalidateUsers([userId]);
    return Response.json({ success: true });
  } catch (error) {
    return handleRouteError(error, "Failed to delete category");
  }
}
