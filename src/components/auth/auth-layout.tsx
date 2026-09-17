import * as React from "react";
import Link from "next/link";
import { ChartPie, Receipt, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/providers/theme-provider";

const HIGHLIGHTS = [
  {
    icon: Receipt,
    title: "Every rupee accounted for",
    body: "Log income and expenses, set budgets, and see your running balance update as you go.",
  },
  {
    icon: Users,
    title: "Split without the spreadsheet",
    body: "Share costs with a group, handle uneven splits, and settle up with a clear record.",
  },
  {
    icon: ChartPie,
    title: "Know where it actually goes",
    body: "Category breakdowns and month-on-month trends, generated straight from your ledger.",
  },
];

/**
 * Two-column auth shell: the form is the only thing on screen below `lg`,
 * with the marketing panel appearing only when there's room for it.
 */
export function AuthLayout({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      {/* ── Form side ───────────────────────────────────────────────── */}
      <div className="flex flex-col px-5 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-full bg-primary font-display text-lg text-primary-foreground"
            >
              F
            </span>
            <span className="font-display text-lg normal-case tracking-normal">Fee-Nance</span>
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm space-y-6">
            <div className="space-y-1.5">
              <h1 className="font-display text-2xl sm:text-3xl text-balance">{title}</h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>

            {children}

            <p className="text-sm text-muted-foreground">{footer}</p>
          </div>
        </div>
      </div>

      {/* ── Context side ────────────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-accent text-accent-foreground lg:flex lg:flex-col lg:justify-center lg:px-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(55%_50%_at_85%_10%,var(--primary),transparent_70%)]"
        />

        <div className="relative max-w-md space-y-8">
          <p className="font-display text-3xl leading-tight">
            Personal and shared money, in one honest ledger.
          </p>

          <ul className="space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, title: heading, body }) => (
              <li key={heading} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-primary"
                >
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block font-medium">{heading}</span>
                  <span className="mt-1 block text-sm text-accent-foreground/75">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <Card className="rounded-3xl bg-card/95 p-4 text-card-foreground">
            <p className="text-sm text-muted-foreground">
              Built as a DBMS mini-project: MongoDB aggregation pipelines behind
              every chart, with authenticated, per-user data isolation.
            </p>
          </Card>
        </div>
      </aside>
    </main>
  );
}
