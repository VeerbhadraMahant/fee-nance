"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Separator } from "@/components/ui/misc";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { PasswordInput } from "@/components/auth/password-input";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [showGoogle, setShowGoogle] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    async function loadProviders() {
      const response = await fetch("/api/auth/providers");
      const providers = (await response.json().catch(() => null)) as Record<
        string,
        { id: string }
      > | null;
      if (isMounted) setShowGoogle(Boolean(providers?.google?.id));
    }

    void loadProviders();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setIsLoading(false);

    if (result?.error) {
      // Deliberately doesn't say which field was wrong — that would leak
      // whether an account exists for this address.
      setError("That email and password combination didn't match. Try again.");
      document.getElementById("login-password")?.focus();
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="space-y-5">
      {showGoogle && (
        <>
          <GoogleSignInButton />
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>
        </>
      )}

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <Field label="Email" htmlFor="login-email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>

        <Field label="Password" htmlFor="login-password" required>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            autoComplete="current-password"
          />
        </Field>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-2xl bg-destructive-subtle px-4 py-2.5 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={isLoading}>
          {isLoading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
