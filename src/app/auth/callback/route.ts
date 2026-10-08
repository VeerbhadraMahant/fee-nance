import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

/**
 * Google sends the user back here (via Supabase) with a one-time `code`.
 * Exchanging it sets the session cookies; then continue to where they were
 * headed. The profile row is created by the on_auth_user_created trigger.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  // Supabase/Google report failures (e.g. the user cancelled consent) as query params.
  if (searchParams.get("error")) {
    return NextResponse.redirect(`${origin}/login?error=${searchParams.get("error") === "access_denied" ? "denied" : "oauth"}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
