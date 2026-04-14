import { FinanceManager } from "@/components/finance/finance-manager";

export default function FinancePage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-1">
        <p className="section-overline">Finance Command</p>
        <h1 className="font-display text-[40px]">
          Money <span className="display-highlight">workspace</span>
        </h1>
        <p className="text-[14px] text-[var(--color-text-secondary)]">
          Create, edit, and track transaction decisions with clarity.
        </p>
      </div>
      <FinanceManager />
    </div>
  );
}
