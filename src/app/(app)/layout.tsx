import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { connection } from "next/server";

import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Per-request by nature; say so explicitly so the build never tries to
  // prerender it (which needs the auth secret at build time).
  await connection();
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  return <AppShell>{children}</AppShell>;
}
