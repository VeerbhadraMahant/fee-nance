import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { loadGroup } from "@/lib/data/groups";
import { GROUP_SELECT, toGroup, type GroupRow } from "@/lib/data/mappers";
import { handleRouteError, must, optionalParam } from "@/lib/route";

const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

const groupListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["createdAt", "name"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  search: z.string().trim().max(100).optional(),
});

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();
    const { searchParams } = new URL(request.url);
    const q = groupListQuerySchema.parse({
      page: optionalParam(searchParams.get("page")),
      limit: optionalParam(searchParams.get("limit")),
      sortBy: optionalParam(searchParams.get("sortBy")),
      sortOrder: optionalParam(searchParams.get("sortOrder")),
      search: optionalParam(searchParams.get("search")),
    });

    const shouldPaginate = q.page !== undefined || q.limit !== undefined;
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;

    // RLS returns only groups the caller is a member of.
    let query = supabase
      .from("groups")
      .select(GROUP_SELECT, { count: "exact" })
      .order(q.sortBy === "name" ? "name" : "created_at", { ascending: q.sortOrder === "asc" });
    if (q.search) {
      // Escape LIKE wildcards so a search for "50%" means the literal text.
      query = query.ilike("name", `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    }
    if (shouldPaginate) query = query.range((page - 1) * limit, page * limit - 1);

    const result = await query;
    const rows = must(result) as unknown as GroupRow[];
    const totalCount = result.count ?? rows.length;

    return Response.json({
      groups: rows.map(toGroup),
      pagination: shouldPaginate
        ? {
            page,
            limit,
            totalCount,
            totalPages: Math.max(1, Math.ceil(totalCount / limit)),
            hasNextPage: page * limit < totalCount,
            hasPrevPage: page > 1,
          }
        : null,
    });
  } catch (error) {
    return handleRouteError(error, "Failed to load groups");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireUser();
    const payload = createGroupSchema.parse(await request.json());

    // Creates the group, its invite code and the owner membership in one transaction.
    const groupId = must(await supabase.rpc("create_group", { p_name: payload.name })) as string;
    const group = await loadGroup(supabase, groupId);

    await invalidateUsers([userId]);
    return Response.json({ group }, { status: 201 });
  } catch (error) {
    return handleRouteError(error, "Failed to create group");
  }
}
