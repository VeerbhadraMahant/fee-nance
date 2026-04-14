export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-1">
        <p className="section-overline">Insights</p>
        <h1 className="font-display text-[40px]">
          Analytics <span className="display-highlight">suite</span>
        </h1>
        <p className="text-[14px] text-[var(--color-text-secondary)]">
          Deep-dive charts and trend analysis — coming soon.
        </p>
      </div>
      <div className="panel flex min-h-[320px] items-center justify-center">
        <p className="text-[var(--color-text-tertiary)] text-sm">Analytics views are under construction.</p>
      </div>
    </div>
  );
}
