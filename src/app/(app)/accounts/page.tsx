export default function AccountsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-1">
        <p className="section-overline">Accounts</p>
        <h1 className="font-display text-[40px]">
          Your <span className="display-highlight">accounts</span>
        </h1>
        <p className="text-[14px] text-[var(--color-text-secondary)]">
          Manage wallets, bank accounts, and payment methods — coming soon.
        </p>
      </div>
      <div className="panel flex min-h-[320px] items-center justify-center">
        <p className="text-[var(--color-text-tertiary)] text-sm">Accounts management is under construction.</p>
      </div>
    </div>
  );
}
