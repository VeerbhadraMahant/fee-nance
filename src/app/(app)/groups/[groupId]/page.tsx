import { GroupDetail } from "@/components/groups/group-detail";
import Link from "next/link";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-1">
        <Link
          href="/groups"
          className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] mb-1"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
          </svg>
          Back to Groups
        </Link>
        <p className="section-overline">Settlement View</p>
        <h1 className="font-display text-[40px]">
          Group <span className="display-highlight">detail</span>
        </h1>
        <p className="text-[14px] text-[var(--color-text-secondary)]">
          Track splits, net balances, and settlement movement.
        </p>
      </div>
      <GroupDetail groupId={groupId} />
    </div>
  );
}
