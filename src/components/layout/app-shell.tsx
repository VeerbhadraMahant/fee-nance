"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, LogOut, MoreHorizontal, Search, Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { useIsFetching } from "@/lib/use-query";
import {
  ALL_NAV_ITEMS,
  BOTTOM_BAR_HREFS,
  NAV_SECTIONS,
  isActivePath,
  type NavItem,
} from "./nav-config";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { ThemeToggle } from "@/components/providers/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toaster";
import { useCurrentUser } from "@/components/providers/current-user";
import { OfflineStatus } from "@/components/offline/offline-status";
import { OnboardingProvider, SampleDataBanner, useOnboarding } from "@/components/onboarding/onboarding";
import { clearOfflineData, hasPendingChanges, startOffline } from "@/lib/offline/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";

/* ── Brand ─────────────────────────────────────────────────────────────── */

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-display text-lg text-primary-foreground",
        className,
      )}
    >
      F
    </span>
  );
}

function Brand() {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2.5 rounded-md px-1 py-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <BrandMark />
      <span className="font-display text-lg normal-case tracking-normal leading-none">Fee-Nance</span>
    </Link>
  );
}

/* ── Account menu ──────────────────────────────────────────────────────── */

function AccountMenu({
  align = "start",
  compact = false,
}: {
  align?: "start" | "end";
  /** Avatar only — the mobile top bar has no room for the name. */
  compact?: boolean;
}) {
  const user = useCurrentUser();
  const { confirm, confirmDialog } = useConfirm();
  const { startTour } = useOnboarding();
  const name = user?.name ?? "Your account";
  const email = user?.email ?? "";

  const handleSignOut = async () => {
    const waiting = hasPendingChanges();
    const ok = await confirm({
      title: waiting ? "Sign out and lose unsynced changes?" : "Sign out of Fee-Nance?",
      description: waiting
        ? "Some changes were made offline and haven't reached the server yet. Signing out deletes them from this device. Cancel, get online, and let them sync first."
        : "You'll need to sign in again to reach your ledger. Data saved on this device for offline use is removed.",
      confirmLabel: waiting ? "Sign out anyway" : "Sign out",
      destructive: true,
    });
    if (!ok) return;
    // Saved pages and data belong to this account; they must not outlive it.
    await clearOfflineData(user?.id);
    // A real form POST: the route clears the auth cookies and redirects, and
    // the full navigation drops every client-side cache with them.
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/auth/signout";
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={compact ? `Account menu for ${name}` : undefined}
            className="flex w-full min-w-0 items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            >
              {initials(name)}
            </span>
            <span className={cn("min-w-0 flex-1", compact && "sr-only")}>
              <span className="block truncate text-sm font-medium">{name}</span>
              {email && (
                <span className="block truncate text-xs text-muted-foreground">
                  {email}
                </span>
              )}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-medium text-foreground">
              {name}
            </span>
            {email && <span className="block truncate text-xs">{email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <Settings />
              Profile &amp; settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={startTour}>
            <Compass />
            Take the tour
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Destructive action kept separated from navigation items. */}
          <DropdownMenuItem variant="destructive" onSelect={handleSignOut}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {confirmDialog}
    </>
  );
}

/* ── Search trigger ────────────────────────────────────────────────────── */

/** "Ctrl K" on Windows and Linux, "⌘K" on a Mac. Server and first paint use Ctrl, so hydration never mismatches. */
const noSubscribe = () => () => {};
function useIsMac() {
  return React.useSyncExternalStore(
    noSubscribe,
    () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}

function SearchButton() {
  const isMac = useIsMac();
  return (
    <button
      type="button"
      data-tour="search"
      onClick={openCommandPalette}
      className="flex h-10 w-full items-center gap-2.5 rounded-full border border-sidebar-border px-4 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 text-left">Search</span>
      <kbd className="shrink-0 rounded-full border border-border px-2 py-0.5 font-sans text-2xs font-medium leading-none text-muted-foreground">
        {isMac ? "⌘ K" : "Ctrl K"}
      </kbd>
    </button>
  );
}

/* ── Fetch progress ────────────────────────────────────────────────────── */

/**
 * A hairline across the top of the viewport while any data request is in
 * flight. With stale-while-revalidate the old data stays on screen during a
 * refresh, so this is the cue that newer numbers are on their way.
 */
function FetchProgress() {
  const fetching = useIsFetching();
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-300",
        fetching ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="h-full w-1/3 animate-[progress-slide_1.1s_ease-in-out_infinite] bg-primary" />
    </div>
  );
}

function SidebarLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-11 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      {item.label}
    </Link>
  );
}

/* ── Desktop sidebar ───────────────────────────────────────────────────── */

function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex print:hidden">
      <div className="flex h-16 items-center justify-between px-4">
        <Brand />
        <ThemeToggle />
      </div>

      <div className="px-3 pb-2">
        <SearchButton />
      </div>

      <nav aria-label="Main" data-tour="nav" className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="space-y-1">
            <p className="overline px-4 pb-1">{section.label}</p>
            {section.items.map((item) => (
              <SidebarLink key={item.href} item={item} active={isActivePath(pathname, item.href)} />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <AccountMenu />
      </div>
    </aside>
  );
}

/* ── Mobile top bar ────────────────────────────────────────────────────── */

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center justify-between gap-2 border-b border-border bg-background/90 pb-0 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden print:hidden">
      <Brand />
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={openCommandPalette}
          data-tour="search"
          aria-label="Search pages and actions"
          className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Search className="size-4" />
        </button>
        <ThemeToggle />
        <div>
          <AccountMenu align="end" compact />
        </div>
      </div>
    </header>
  );
}

/* ── Mobile bottom navigation ──────────────────────────────────────────── */

const tabClass = (active: boolean) =>
  cn(
    "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-2xs font-medium transition-colors",
    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
    active ? "text-primary" : "text-muted-foreground",
  );

function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);

  const tabs = BOTTOM_BAR_HREFS.map((href) => ALL_NAV_ITEMS.find((item) => item.href === href)!);
  // "More" lights up when the current page isn't one of the four tabs.
  const moreActive = !tabs.some((item) => isActivePath(pathname, item.href));

  return (
    <>
      <nav
        aria-label="Main"
        data-tour="nav"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden print:hidden"
      >
        {tabs.map(({ href, label, shortLabel, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              // min-h-14 keeps the tap area comfortably past 44px.
              className={tabClass(active)}
            >
              <Icon className="size-5 shrink-0" strokeWidth={active ? 2.4 : 1.8} aria-hidden="true" />
              {/* Icons always carry a text label — icon-only nav hurts discoverability. */}
              <span className="max-w-full truncate">{shortLabel ?? label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={tabClass(moreActive)}
        >
          <MoreHorizontal className="size-5 shrink-0" strokeWidth={moreActive ? 2.4 : 1.8} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="right" className="overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <div className="px-5 pb-2 pt-5">
            <SheetTitle className="font-display text-xl">Everything</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Every page in Fee-Nance.
            </SheetDescription>
          </div>
          <nav aria-label="All pages" className="space-y-5 px-3 py-2">
            {NAV_SECTIONS.map((section) => (
              <div key={section.label} className="space-y-1">
                <p className="overline px-4 pb-1">{section.label}</p>
                {section.items.map((item) => (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    active={isActivePath(pathname, item.href)}
                    onNavigate={() => setMoreOpen(false)}
                  />
                ))}
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ── Recurring entries ─────────────────────────────────────────────────────
   Generates whatever recurring entries have fallen due, once per browser
   session. The runner is idempotent, so a second tab or a retry is harmless. */

const RECURRING_RUN_KEY = "feenance:recurring-run";

function useDueRecurringEntries() {
  React.useEffect(() => {
    try {
      if (sessionStorage.getItem(RECURRING_RUN_KEY)) return;
    } catch {
      // Storage unavailable: run anyway; it is safe to repeat.
    }

    void fetch("/api/private/transactions/recurring/run", { method: "POST" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { generatedCount?: number } | null) => {
        // Only a run that reached the server counts; offline, try again later.
        if (body) {
          try {
            sessionStorage.setItem(RECURRING_RUN_KEY, "1");
          } catch {
            // ignore
          }
        }
        const count = body?.generatedCount ?? 0;
        if (!count) return;
        toast.success(`Added ${count} recurring entr${count === 1 ? "y" : "ies"} that fell due`, {
          action: { label: "Refresh", onClick: () => window.location.reload() },
        });
      })
      .catch(() => {
        // Background convenience only; the dashboard button still works.
      });
  }, []);
}

/* ── Shell ─────────────────────────────────────────────────────────────── */

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser();
  const userId = user?.id;
  React.useEffect(() => {
    if (userId) startOffline(userId);
  }, [userId]);
  useDueRecurringEntries();

  return (
    <OnboardingProvider>
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to main content
      </a>

      <FetchProgress />
      <DesktopSidebar />
      <MobileTopBar />

      <div className="lg:pl-64 print:pl-0">
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            "mx-auto w-full max-w-6xl px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8",
            // Clears the fixed bottom nav (and the home indicator) on mobile.
            "pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8 print:max-w-none print:p-0",
          )}
        >
          <SampleDataBanner />
          {children}
        </main>
      </div>

      <MobileBottomNav />
      <OfflineStatus />
      <CommandPalette />
    </div>
    </OnboardingProvider>
  );
}
