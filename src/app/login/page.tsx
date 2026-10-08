import type { Metadata } from "next";

import { AuthLayout } from "@/components/auth/auth-layout";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  oauth: "Google sign-in didn't complete. Please try again.",
  denied: "Sign-in was cancelled. Continue with Google whenever you're ready.",
  config: "Sign-in isn't configured on this server yet.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  // Signed-in visitors are redirected to the dashboard by the proxy.
  const { next, error } = await searchParams;

  return (
    <AuthLayout
      title="Welcome to Fee-Nance"
      subtitle="Sign in with your Google account. New here? The same button creates your account."
    >
      <div className="space-y-5">
        {error && ERRORS[error] && (
          <p role="alert" className="rounded-2xl bg-destructive-subtle px-4 py-2.5 text-sm text-destructive">
            {ERRORS[error]}
          </p>
        )}
        <GoogleSignInButton next={safeNextPath(next)} />
        <p className="text-center text-xs text-muted-foreground">
          We only use your name, email and profile picture from Google.
        </p>
      </div>
    </AuthLayout>
  );
}
