import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { toCategory, type CategoryRow } from "@/lib/data/mappers";
import { handleRouteError, must } from "@/lib/route";

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(50),
  type: z.enum(["income", "expense"]),
  icon: z.string().trim().min(1).max(40).optional(),
  color: z.string().trim().min(4).max(20).optional(),
});

/** System categories first, then the caller's own, alphabetically. RLS does the scoping. */
export async function GET() {
  try {
    const { supabase } = await requireUser();
    const rows = must(
      await supabase
        .from("categories")
        .select("*")
        .order("is_system", { ascending: false })
        .order("name", { ascending: true }),
    ) as CategoryRow[];

    return Response.json({ categories: rows.map(toCategory) });
  } catch (error) {
    return handleRouteError(error, "Failed to load categories");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireUser();
    const payload = createCategorySchema.parse(await request.json());

    const row = must(
      await supabase
        .from("categories")
        .insert({
          user_id: userId,
          name: payload.name,
          type: payload.type,
          icon: payload.icon ?? null,
          color: payload.color ?? null,
          is_system: false,
        })
        .select()
        .single(),
    ) as CategoryRow;

    await invalidateUsers([userId]);
    return Response.json({ category: toCategory(row) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Failed to create category", {
      conflictMessage: "Category with this name and type already exists",
    });
  }
}
