"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Separator } from "@/components/ui/misc";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { PasswordInput } from "@/components/auth/password-input";

const MIN_PASSWORD = 8;

/** Live requirement checklist — tells the user what "valid" means up front
 *  instead of rejecting them after submit. */
function PasswordChecklist({ value }: { value: string }) {
  const rules = [
    { label: `At least ${MIN_PASSWORD} characters`, met: value.length >= MIN_PASSWORD },
    { label: "Contains a number", met: /\d/.test(value) },
    { label: "Contains a letter", met: /[a-zA-Z]/.test(value) },
  ];

  return (
    <ul className="space-y-1" aria-label="Password requirements">
      {rules.map((rule) => (
        <li
          key={rule.label}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            rule.met ? "text-success" : "text-muted-foreground",
          )}
        >
          <Check
            className={cn("size-3.5 shrink-0", !rule.met && "opacity-40")}
            aria-hidden="true"
          />
          {rule.label}
          <span className="sr-only">{rule.met ? " — met" : " — not yet met"}</span>
        </li>
      ))}
    </ul>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
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

    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Tell us what to call you.";
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Enter a valid email address.";
    if (password.length < MIN_PASSWORD) {
      next.password = `Passwords need at least ${MIN_PASSWORD} characters.`;
    }

    setErrors(next);
    if (Object.keys(next).length) {
      document.getElementById(`register-${Object.keys(next)[0]}`)?.focus();
      return;
    }

    setIsLoading(true);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      setIsLoading(false);
      setErrors({ form: data?.error ?? "We couldn't create your account. Try again." });
      return;
    }

    await signIn("credentials", { email: email.trim(), password, redirect: false });
    setIsLoading(false);
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
        <Field label="Full name" htmlFor="register-name" required error={errors.name}>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </Field>

        <Field label="Email" htmlFor="register-email" required error={errors.email}>
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

        <div className="space-y-2">
          <Field
            label="Password"
            htmlFor="register-password"
            required
            error={errors.password}
          >
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`At least ${MIN_PASSWORD} characters`}
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
            />
          </Field>
          <PasswordChecklist value={password} />
        </div>

        {errors.form && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-2xl bg-destructive-subtle px-4 py-2.5 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {errors.form}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" loading={isLoading}>
          {isLoading ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
