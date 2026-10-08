"use client";

import * as React from "react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

/** Official Google "G" mark — colours and proportions per their brand guidance. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Starts Supabase's Google OAuth flow. Google returns to Supabase, which
 * returns to /auth/callback with a one-time code that becomes the session.
 */
export function GoogleSignInButton({ next = "/dashboard" }: { next?: string }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleClick = async () => {
    setPending(true);
    setError(null);
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", next);

    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });

    // On success the browser is already navigating to Google.
    if (oauthError) {
      setPending(false);
      setError("Couldn't reach Google sign-in. Try again in a moment.");
    }
  };

  return (
    <div className="space-y-3">
      <Button type="button" size="lg" variant="outline" className="w-full" loading={pending} onClick={handleClick}>
        {!pending && <GoogleMark />}
        Continue with Google
      </Button>
      {error && (
        <p role="alert" className="rounded-2xl bg-destructive-subtle px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
