import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** POST only, so a prefetched or crawled link can't sign anyone out. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
