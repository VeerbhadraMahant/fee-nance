import type { Metadata } from "next";

import { AuthLayout } from "@/components/auth/auth-layout";
import { EmailAuthForm } from "@/components/auth/email-auth-form";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  oauth: "Sign-in didn't complete. Please try again. If you used an email link, open it in the same browser you asked for it from.",
  denied: "Sign-in was cancelled. Try again whenever you're ready.",
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
      subtitle="Sign in with Google or your email. New here? Either way creates your account."
    >
      <div className="space-y-5">
        {error && ERRORS[error] && (
          <p role="alert" className="rounded-2xl bg-destructive-subtle px-4 py-2.5 text-sm text-destructive">
            {ERRORS[error]}
          </p>
        )}
        <GoogleSignInButton next={safeNextPath(next)} />
        {process.env.DEMO_LOGIN === "true" && process.env.NODE_ENV !== "production" && (
          <a
            href="/auth/demo"
            className="block rounded-full border border-border px-4 py-2.5 text-center text-sm font-medium hover:bg-muted"
          >
            Continue as demo user
          </a>
        )}
        <p className="text-center text-xs text-muted-foreground">
          We only use your name, email and profile picture from Google.
        </p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator" aria-label="or">
          <span className="h-px flex-1 bg-border" />
          or use your email
          <span className="h-px flex-1 bg-border" />
        </div>

        <EmailAuthForm next={safeNextPath(next)} />
      </div>
    </AuthLayout>
  );
}
