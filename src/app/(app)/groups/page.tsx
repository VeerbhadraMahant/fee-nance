import { GroupManager } from "@/components/groups/group-manager";

export default function GroupsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-1">
        <p className="section-overline">Shared Ledger</p>
        <h1 className="font-display text-[40px]">
          Group <span className="display-highlight">workspace</span>
        </h1>
        <p className="text-[14px] text-[var(--color-text-secondary)]">
          Create, join, and settle group expenses with precision.
        </p>
      </div>
      <GroupManager />
    </div>
  );
}
