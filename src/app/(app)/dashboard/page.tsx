import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-1">
        <p className="section-overline">Your Week</p>
        <h1 className="font-display text-[40px]">
          Dashboard <span className="display-highlight">pulse</span>
        </h1>
        <p className="text-[14px] text-[var(--color-text-secondary)]">
          Welcome, {session?.user?.name ?? session?.user?.email}
        </p>
      </div>
      <DashboardOverview />
    </div>
  );
}
