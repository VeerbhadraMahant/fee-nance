import { createClient } from "@/lib/supabase/server";

/**
 * Resolves the signed-in user for a route handler and hands back a Supabase
 * client acting as them. getClaims() verifies the JWT rather than trusting
 * the cookie, so this is safe to use as the identity check. Throws
 * "UNAUTHORIZED" when there's no valid session; handlers map that to 401.
 */
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || !userId) {
    throw new Error("UNAUTHORIZED");
  }

  return { supabase, userId };
}
