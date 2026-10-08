import { HttpError, isUuid, must } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

/**
 * Confirms the caller may file a transaction or budget under this category
 * (a system category or one of their own) and returns its id. Row-level
 * security hides everyone else's categories, so "not visible" and "doesn't
 * exist" are the same answer.
 */
export async function resolveAccessibleCategoryId(
  supabase: SupabaseServerClient,
  categoryId: string | null | undefined,
) {
  if (!categoryId) return null;
  if (!isUuid(categoryId)) throw new HttpError(422, "Category not found");

  const row = must(
    await supabase.from("categories").select("id").eq("id", categoryId).maybeSingle(),
  );
  if (!row) throw new HttpError(422, "Category not found");
  return row.id as string;
}
