import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { connection } from "next/server";

import { authOptions } from "@/lib/auth";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Per-request by nature; say so explicitly so the build never tries to
  // prerender it (which needs the auth secret at build time).
  await connection();
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <>
          New here?{" "}
          <Link
            href="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
