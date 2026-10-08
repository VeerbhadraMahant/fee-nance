import type { Metadata } from "next";

import { getCurrentUser } from "@/lib/current-user";
import { PageHeader } from "@/components/layout/page-header";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const firstName = user?.name.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        description="Your balance, spending and shared expenses at a glance."
      />
      <DashboardOverview />
    </div>
  );
}
