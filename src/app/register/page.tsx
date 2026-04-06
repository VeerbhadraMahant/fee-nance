import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-5 py-10 text-[var(--color-text)]">
      <div className="mx-auto flex w-full max-w-md flex-col gap-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-8 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-muted)]">Fee-Nance</p>
          <h1 className="text-3xl leading-tight text-[var(--color-text)]">Create your account</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Start tracking expenses, budgets, and shared group balances.
          </p>
        </div>

        <RegisterForm />

        <p className="text-sm text-[var(--color-muted)]">
          Already have an account?{" "}
          <Link className="text-[var(--color-accent)] hover:underline" href="/login">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
