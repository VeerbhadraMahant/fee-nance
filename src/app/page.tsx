import Link from "next/link";
import type { CSSProperties } from "react";
import { LandingMotion } from "@/components/landing/landing-motion";

export default function Home() {
  return (
    <main className="landing-root relative min-h-screen overflow-hidden text-[var(--color-text)]">
      <LandingMotion />
      <div className="landing-liquid pointer-events-none absolute inset-0" />
      <div className="landing-vignette pointer-events-none absolute inset-0" />
      <div className="noise-layer pointer-events-none absolute inset-0" />

      <div className="relative mx-auto flex w-full max-w-[1080px] flex-col px-6 pb-16 pt-6 md:px-10">
        <header className="landing-nav reveal-on-scroll flex items-center justify-between gap-4" style={{ "--reveal-delay": "0ms" } as CSSProperties}>
          <p className="font-display text-[38px] leading-none text-[rgba(245,244,255,0.97)]">Fee-Nance</p>
          <nav className="hidden items-center gap-10 md:flex">
            <Link href="/finance" className="landing-nav-link">
              Ledger
            </Link>
            <Link href="/groups" className="landing-nav-link">
              Groups
            </Link>
            <Link
              href="/dashboard"
              className="landing-nav-link"
            >
              Reports
            </Link>
          </nav>
          <Link href="/register" className="landing-primary-btn hidden px-6 py-2.5 text-[13px] font-semibold md:inline-flex">
            Register Now
          </Link>
        </header>

        <section className="relative pb-4 pt-16 text-center md:pt-20">
          <p className="section-overline reveal-on-scroll" style={{ "--reveal-delay": "100ms" } as CSSProperties}>Your personal Finance Assistant at bay</p>
          <h1 className="reveal-on-scroll mt-4 font-display text-[72px] leading-[0.94] text-[rgba(250,249,255,0.98)] md:text-[148px]" style={{ "--reveal-delay": "200ms" } as CSSProperties}>
            Fee-Nance
          </h1>
          <p className="reveal-on-scroll mx-auto mt-6 max-w-[560px] text-[25px] font-light leading-tight text-[rgba(203,200,230,0.86)] md:text-[38px]" style={{ "--reveal-delay": "300ms" } as CSSProperties}>
            Where personal tracking meets <span className="font-display text-[rgba(255,255,255,0.98)]">clarity</span>
          </p>
          <div className="reveal-on-scroll mt-11 flex flex-wrap items-center justify-center gap-3" style={{ "--reveal-delay": "400ms" } as CSSProperties}>
            <Link href="/register" className="landing-primary-btn px-11 py-3.5 text-[20px] md:text-[24px]">
              Register Now
            </Link>
            <Link href="/login" className="landing-ghost-btn px-11 py-3.5 text-[20px] md:text-[24px]">
              Explore Ecosystem
            </Link>
          </div>
        </section>

        <section className="mt-12 grid gap-5 md:grid-cols-2">
          <article className="landing-glass reveal-on-scroll p-7 md:p-8" style={{ "--reveal-delay": "0ms" } as CSSProperties}>
            <span className="landing-icon-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="4" width="14" height="16" rx="2" />
                <path d="M9 8h6" />
                <path d="M9 12h6" />
              </svg>
            </span>
            <h2 className="mt-5 font-display text-[42px] text-[rgba(244,243,255,0.97)] md:text-[50px]">Architectural Ledger</h2>
            <p className="mt-3 max-w-[480px] text-[17px] text-[rgba(175,170,208,0.86)] md:text-[20px]">
              Beyond simple tracking. Design your financial blueprint with precision tools crafted for the visionary economy.
            </p>
          </article>
          <article className="landing-glass reveal-on-scroll p-7 md:p-8" style={{ "--reveal-delay": "150ms" } as CSSProperties}>
            <span className="landing-icon-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="9" r="2.5" />
                <circle cx="16" cy="8" r="2" />
                <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
                <path d="M13.5 18a3.5 3.5 0 0 1 7 0" />
              </svg>
            </span>
            <h2 className="mt-5 font-display text-[42px] text-[rgba(244,243,255,0.97)] md:text-[50px]">Group Sync</h2>
            <p className="mt-3 max-w-[480px] text-[17px] text-[rgba(175,170,208,0.86)] md:text-[20px]">
              Seamlessly merge shared capital strategies with your inner circle in real-time environments.
            </p>
          </article>
        </section>

        <section className="landing-glass reveal-on-scroll mt-5 flex flex-wrap items-center justify-between gap-6 p-7 md:p-8" style={{ "--reveal-delay": "260ms" } as CSSProperties}>
          <div>
            <h2 className="font-display text-[40px] text-[rgba(244,243,255,0.97)] md:text-[46px]">Smart Financial Insights</h2>
            <p className="mt-2 max-w-[560px] text-[17px] text-[rgba(175,170,208,0.86)] md:text-[19px]">
              Get clear monthly trends, category-level breakdowns, and faster decisions from your personal and group spending data.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="landing-chip">SPENDING_TRENDS</span>
            <span className="landing-chip">CATEGORY_BREAKDOWN</span>
          </div>
        </section>
      </div>
    </main>
  );
}
