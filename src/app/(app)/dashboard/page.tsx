import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <p className="section-overline">THE OVERVIEW</p>
        <h1 className="font-display text-[40px]">
          Your financial sanctuary,{" "}
          <span className="display-highlight">effortlessly</span> managed.
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          A bird's-eye view of your wealth — every asset, every liability, synchronized in one sovereign space.{" "}
          <span className="text-[var(--color-text-tertiary)]">
            Welcome back, {session?.user?.name ?? session?.user?.email}.
          </span>
        </p>
      </header>
      <DashboardOverview />
    </div>
  );
}
