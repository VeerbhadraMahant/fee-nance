import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { jsonError } from "@/lib/http";
import { handleRouteError, must } from "@/lib/route";
import { dashboardRangeValues, type DashboardDefaultRange } from "@/lib/user-preferences";

const preferenceSchema = z.object({
  currency: z.literal("INR").optional(),
  dashboardDefaultRange: z.enum(dashboardRangeValues).optional(),
});

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    preferences: preferenceSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.preferences?.currency !== undefined ||
      value.preferences?.dashboardDefaultRange !== undefined,
    { message: "At least one field is required" },
  );

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  currency: "INR";
  dashboard_default_range: DashboardDefaultRange;
}

const PROFILE_COLUMNS = "id, name, email, avatar_url, currency, dashboard_default_range";

function serialize(row: ProfileRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.avatar_url ?? undefined,
    preferences: {
      currency: row.currency,
      dashboardDefaultRange: row.dashboard_default_range,
    },
  };
}

export async function GET() {
  try {
    const { supabase, userId } = await requireUser();
    const row = must(
      await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle(),
    ) as ProfileRow | null;
    if (!row) return jsonError("User not found", 404);
    return Response.json({ user: serialize(row) });
  } catch (error) {
    return handleRouteError(error, "Failed to load user profile");
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, userId } = await requireUser();
    const payload = updateProfileSchema.parse(await request.json());

    const updates: Record<string, unknown> = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.preferences?.currency !== undefined) updates.currency = payload.preferences.currency;
    if (payload.preferences?.dashboardDefaultRange !== undefined) {
      updates.dashboard_default_range = payload.preferences.dashboardDefaultRange;
    }

    const row = must(
      await supabase.from("profiles").update(updates).eq("id", userId).select(PROFILE_COLUMNS).maybeSingle(),
    ) as ProfileRow | null;
    if (!row) return jsonError("User not found", 404);
    return Response.json({ user: serialize(row) });
  } catch (error) {
    return handleRouteError(error, "Failed to update user profile");
  }
}
