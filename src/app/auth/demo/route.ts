import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Demo login bypass: signs in the seeded demo account without Google.
 * Off unless DEMO_LOGIN=true, and never on in production builds.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const { DEMO_LOGIN, DEMO_EMAIL, DEMO_PASSWORD } = process.env;

  if (process.env.NODE_ENV === "production" || DEMO_LOGIN !== "true" || !DEMO_EMAIL || !DEMO_PASSWORD) {
    return NextResponse.redirect(`${origin}/login?error=config`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  return NextResponse.redirect(`${origin}${error ? "/login?error=oauth" : "/dashboard"}`);
}
