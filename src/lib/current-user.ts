import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

/**
 * The signed-in user's profile for Server Components, or null. Wrapped in
 * React's cache() so the layout and the page share one lookup per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  const email = (data.claims.email as string | undefined) ?? "";
  return {
    id: userId,
    name: profile?.name ?? email.split("@")[0] ?? "You",
    email: profile?.email ?? email,
    avatarUrl: profile?.avatar_url ?? null,
  };
});
