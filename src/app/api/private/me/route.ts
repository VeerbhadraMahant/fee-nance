import { z } from "zod";

import { requireUser } from "@/lib/api-auth";
import { invalidateUsers } from "@/lib/cache";
import { jsonError } from "@/lib/http";
import { handleRouteError, must } from "@/lib/route";
import { UPI_ID_PATTERN } from "@/lib/upi";
import { dashboardRangeValues, type DashboardDefaultRange } from "@/lib/user-preferences";

const preferenceSchema = z.object({
  currency: z.literal("INR").optional(),
  dashboardDefaultRange: z.enum(dashboardRangeValues).optional(),
  // Whether your share of group expenses counts in budgets, totals and insights.
  countGroupShares: z.boolean().optional(),
});

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    // Empty string or null clears it.
    upiId: z
      .string()
      .trim()
      .refine((value) => value === "" || UPI_ID_PATTERN.test(value), {
        message: "That doesn't look like a UPI ID (it should be like name@bank)",
      })
      .nullable()
      .optional(),
    preferences: preferenceSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.upiId !== undefined ||
      value.preferences?.currency !== undefined ||
      value.preferences?.dashboardDefaultRange !== undefined ||
      value.preferences?.countGroupShares !== undefined,
    { message: "At least one field is required" },
  );

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  upi_id: string | null;
  currency: "INR";
  dashboard_default_range: DashboardDefaultRange;
  count_group_shares: boolean;
}

const PROFILE_COLUMNS =
  "id, name, email, avatar_url, upi_id, currency, dashboard_default_range, count_group_shares";

function serialize(row: ProfileRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.avatar_url ?? undefined,
    upiId: row.upi_id ?? undefined,
    preferences: {
      currency: row.currency,
      dashboardDefaultRange: row.dashboard_default_range,
      countGroupShares: row.count_group_shares,
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
    if (payload.upiId !== undefined) updates.upi_id = payload.upiId || null;
    if (payload.preferences?.currency !== undefined) updates.currency = payload.preferences.currency;
    if (payload.preferences?.dashboardDefaultRange !== undefined) {
      updates.dashboard_default_range = payload.preferences.dashboardDefaultRange;
    }
    if (payload.preferences?.countGroupShares !== undefined) {
      updates.count_group_shares = payload.preferences.countGroupShares;
    }

    const row = must(
      await supabase.from("profiles").update(updates).eq("id", userId).select(PROFILE_COLUMNS).maybeSingle(),
    ) as ProfileRow | null;
    if (!row) return jsonError("User not found", 404);

    // Every cached total depends on whether group shares count.
    if (payload.preferences?.countGroupShares !== undefined) await invalidateUsers([userId]);
    return Response.json({ user: serialize(row) });
  } catch (error) {
    return handleRouteError(error, "Failed to update user profile");
  }
}
