import Link from "next/link";
import {
  ArrowRight,
  ChartPie,
  Receipt,
  Repeat,
  Scale,
  Target,
  Users,
} from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/providers/theme-provider";

const FEATURES = [
  {
    icon: Receipt,
    title: "Track every transaction",
    body: "Log income and expenses with categories, notes and dates. Your running balance updates as you go.",
  },
  {
    icon: Users,
    title: "Split with a group",
    body: "Equal, exact-amount or percentage splits, with support for several people paying on the same bill.",
  },
  {
    icon: Scale,
    title: "Settle up cleanly",
    body: "Fee-Nance works out the shortest set of payments that clears everyone's balance, then records them.",
  },
  {
    icon: Target,
    title: "Budgets that hold you honest",
    body: "Set monthly, quarterly or yearly limits — per category or overall — and watch spend against them.",
  },
  {
    icon: Repeat,
    title: "Recurring entries",
    body: "Rent, salary, subscriptions: define them once and generate each period's entry on demand.",
  },
  {
    icon: ChartPie,
    title: "Analytics worth reading",
    body: "Category breakdowns, month-on-month trends and savings trajectory, all from your own data.",
  },
];

export default function Home() {
  return (
    <main className="min-h-dvh">
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b-[1.5px] border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-full bg-primary font-display text-lg text-primary-foreground"
            >
              F
            </span>
            <span className="font-display text-lg normal-case tracking-normal">Fee-Nance</span>
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b-[1.5px] border-border">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-80 [background:radial-gradient(60%_50%_at_50%_-10%,var(--accent),transparent_65%),radial-gradient(35%_35%_at_85%_10%,var(--primary),transparent_70%)]"
        />

        <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:px-8">
          <Reveal>
            <p className="overline">Personal &amp; group finance</p>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="mx-auto mt-4 max-w-4xl font-display text-4xl sm:text-6xl lg:text-[6.5rem] lg:leading-[0.92]">
              Know where your money went, and who still owes you.
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="measure mx-auto mt-5 text-lg text-muted-foreground">
              Fee-Nance keeps your own ledger and your shared expenses in the same
              place — so you stop reconciling two systems in your head.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild className="w-full sm:w-auto">
                <Link href="/register">
                  Create your account
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <p className="mt-4 text-xs text-muted-foreground">
              Free to use · Amounts in INR (₹)
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <Reveal>
          <div className="max-w-2xl">
            <p className="overline">What it does</p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl">
              Six things, done properly.
            </h2>
          </div>
        </Reveal>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }, index) => (
            <li key={title}>
              <Reveal delay={index * 60}>
                <Card className="h-full p-6">
                  <span
                    aria-hidden="true"
                    className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-medium">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                </Card>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Closing CTA ─────────────────────────────────────────────── */}
      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-6xl rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground sm:py-20">
          <Reveal>
            <h2 className="font-display text-3xl sm:text-5xl">
              Start with this month.
            </h2>
            <p className="measure mx-auto mt-3 text-primary-foreground/80">
              Add a handful of transactions and the dashboard, budgets and
              breakdowns fill themselves in.
            </p>
            <Button
              size="lg"
              variant="secondary"
              asChild
              className="mt-7 border-[1.5px] border-foreground"
            >
              <Link href="/register">
                Get started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t-[1.5px] border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <p>Fee-Nance — personal and group expense tracking.</p>
          <p>Built as a DBMS mini-project.</p>
        </div>
      </footer>
    </main>
  );
}
