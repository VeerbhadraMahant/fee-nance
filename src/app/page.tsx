import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--color-bg)] px-6 py-10 text-[var(--color-text)] md:px-10 lg:px-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(184,143,70,0.28),transparent_36%),radial-gradient(circle_at_78%_26%,rgba(145,106,46,0.2),transparent_40%),linear-gradient(140deg,#0b0b0e_0%,#111117_40%,#070709_100%)]" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[rgba(20,20,24,0.72)] px-5 py-4 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">Fee-Nance</p>
            <h1 className="font-display text-2xl text-[var(--color-text)]">Cinematic Finance Control</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110"
            >
              Get Started
            </Link>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-8 shadow-[0_40px_120px_rgba(0,0,0,0.5)]">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-muted)]">Private Wealth Engine</p>
            <h2 className="mt-4 max-w-2xl font-display text-4xl leading-tight text-[var(--color-text)] md:text-5xl">
              Track personal money and shared group expenses with editorial precision.
            </h2>
            <p className="mt-6 max-w-xl text-sm leading-7 text-[var(--color-muted)] md:text-base">
              Fee-Nance combines personal transaction intelligence, budget discipline, and multi-payer group expense splitting in one private authenticated workspace.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">Currency</p>
                <p className="mt-3 text-lg text-[var(--color-accent)]">INR</p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">Split Types</p>
                <p className="mt-3 text-lg text-[var(--color-accent)]">Equal, Custom, Percentage</p>
              </div>
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">Recurring</p>
                <p className="mt-3 text-lg text-[var(--color-accent)]">Monthly, Yearly</p>
              </div>
            </div>
          </article>

          <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-8">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--color-muted)]">MVP Scope</p>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-[var(--color-text)]">
              <li>Personal transaction and budget management</li>
              <li>Custom date filtering and category analysis</li>
              <li>Group creation with invite code onboarding</li>
              <li>Multiple payer support per group expense</li>
              <li>Manual settlements with simplified pairwise balances</li>
              <li>Email-password and Google authentication</li>
            </ul>
            <Link
              href="/register"
              className="mt-7 inline-flex rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-contrast)] transition hover:brightness-110"
            >
              Build My Workspace
            </Link>
          </article>
        </section>
      </div>
    </main>
  );
}
