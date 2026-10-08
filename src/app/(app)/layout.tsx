import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getCurrentUser } from "@/lib/current-user";
import { AppShell } from "@/components/layout/app-shell";
import { CurrentUserProvider } from "@/components/providers/current-user";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Per-request by nature; never prerender it at build time.
  await connection();
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <CurrentUserProvider user={user}>
      <AppShell>{children}</AppShell>
    </CurrentUserProvider>
  );
}
