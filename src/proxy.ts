import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every matched request. Two jobs:
 *
 *   1. Refresh the Supabase session. Access tokens are short-lived; reading
 *      the claims here rotates an expiring token and writes the new cookies
 *      onto the response, so Server Components (which can't set cookies)
 *      always see a valid session.
 *   2. Send signed-out visitors to /login (pages) or answer 401 (API).
 *
 * This is a convenience gate, not the security boundary. Every route handler
 * resolves the user itself, and row-level security in Postgres decides what
 * that user can read or write.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/finance",
  "/groups",
  "/analytics",
  "/insights",
  "/goals",
  "/tax",
  "/report",
  "/profile",
  "/api/private",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!url || !key) {
    // Not configured: let public pages render, refuse protected ones clearly.
    if (!isProtected) return response;
    return pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Supabase is not configured" }, { status: 503 })
      : NextResponse.redirect(new URL("/login?error=config", request.url));
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [header, value] of Object.entries(headers ?? {})) {
          response.headers.set(header, value);
        }
      },
    },
  });

  // getClaims() verifies the JWT (locally with asymmetric signing keys, or
  // against the Auth server otherwise) and refreshes it when needed. Nothing
  // may run between creating the client and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && isProtected) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  if (signedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  // Everything except static assets and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
