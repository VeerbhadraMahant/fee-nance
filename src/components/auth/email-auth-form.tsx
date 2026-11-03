"use client";

import * as React from "react";
import { Mail } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "signin" | "signup";

function friendlyError(message: string) {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Check them, or use the email link below.";
  if (/email not confirmed/i.test(message)) return "Confirm your email first. We sent you a link when you signed up.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Wait a few minutes and try again.";
  if (/password/i.test(message) && /(short|least|weak|characters)/i.test(message)) return "Use a password of at least 8 characters.";
  if (/signups? (are )?(not allowed|disabled)/i.test(message)) return "New sign-ups are turned off for this project.";
  if (/provider is not enabled/i.test(message)) return "Email sign-in isn't enabled for this project yet. Turn on the Email provider in Supabase → Authentication → Sign In / Providers.";
  return "Something went wrong. Please try again.";
}

/**
 * Email and password sign-in, plus a one-time link by email for anyone who
 * forgot their password. Both come back through /auth/callback, the same place
 * Google does, so they end up with the same session and the same profile row
 * (created by the on_auth_user_created trigger).
 */
export function EmailAuthForm({ next = "/dashboard" }: { next?: string }) {
  const [mode, setMode] = React.useState<Mode>("signin");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState<"password" | "link" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const callback = () => {
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", next);
    return url.toString();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending("password");
    const supabase = createClient();

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setPending(null);
        setError(friendlyError(signInError.message));
        return;
      }
      // A full navigation, so the server sees the new session cookies.
      window.location.assign(next);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: callback(), data: { full_name: name.trim() || undefined } },
    });
    setPending(null);
    if (signUpError) {
      setError(friendlyError(signUpError.message));
      return;
    }
    if (data.session) {
      window.location.assign(next); // email confirmation is switched off for this project
      return;
    }
    // Supabase answers the same whether or not the address is already registered.
    setNotice("Check your email. If this address is new, we sent a link to confirm it. If you already have an account, sign in instead.");
  };

  const sendLink = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError("Enter your email above first.");
      return;
    }
    setPending("link");
    const { error: otpError } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callback() },
    });
    setPending(null);
    if (otpError) {
      setError(friendlyError(otpError.message));
      return;
    }
    setNotice("Check your email for a sign-in link. Open it in this same browser.");
  };

  const signup = mode === "signup";

  return (
    <form onSubmit={submit} className="space-y-3">
      {signup && (
        <Input
          type="text"
          name="name"
          autoComplete="name"
          placeholder="Your name"
          aria-label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
      )}
      <Input
        type="email"
        name="email"
        autoComplete="email"
        placeholder="Email"
        aria-label="Email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        type="password"
        name="password"
        autoComplete={signup ? "new-password" : "current-password"}
        placeholder={signup ? "Password (at least 8 characters)" : "Password"}
        aria-label="Password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <Button type="submit" size="lg" className="w-full" loading={pending === "password"}>
        {signup ? "Create account" : "Sign in"}
      </Button>

      {error && (
        <p role="alert" className="rounded-2xl bg-destructive-subtle px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-2xl bg-success-subtle px-4 py-2.5 text-sm text-success">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setMode(signup ? "signin" : "signup");
            setError(null);
            setNotice(null);
          }}
          className="rounded-full px-1 text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {signup ? "Have an account? Sign in" : "New here? Create an account"}
        </button>
        {!signup && (
          <button
            type="button"
            onClick={sendLink}
            disabled={pending !== null}
            className="inline-flex items-center gap-1.5 rounded-full px-1 text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
          >
            <Mail className="size-3.5" aria-hidden="true" />
            {pending === "link" ? "Sending…" : "Email me a sign-in link"}
          </button>
        )}
      </div>
    </form>
  );
}
