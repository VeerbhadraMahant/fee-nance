import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { connection } from "next/server";

import { authOptions } from "@/lib/auth";
import { AuthLayout } from "@/components/auth/auth-layout";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  // Per-request by nature; say so explicitly so the build never tries to
  // prerender it (which needs the auth secret at build time).
  await connection();
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start tracking expenses, budgets and shared balances."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}
