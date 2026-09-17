"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { LogOut, Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { NAV_ITEMS, isActivePath } from "./nav-config";
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

function AccountMenu({ align = "start" }: { align?: "start" | "end" }) {
  const { data: session } = useSession();
  const { confirm, confirmDialog } = useConfirm();
  const name = session?.user?.name ?? "Your account";
  const email = session?.user?.email ?? "";

  const handleSignOut = async () => {
    const ok = await confirm({
      title: "Sign out of Fee-Nance?",
      description: "You'll need to sign in again to reach your ledger.",
      confirmLabel: "Sign out",
      destructive: true,
    });
    if (ok) await signOut({ callbackUrl: "/login" });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            >
              {initials(name)}
            </span>
            <span className="min-w-0 flex-1 lg:block">
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

/* ── Desktop sidebar ───────────────────────────────────────────────────── */

function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r-[1.5px] border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center justify-between px-4">
        <Brand />
        <ThemeToggle />
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
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
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t-[1.5px] border-sidebar-border p-2">
        <AccountMenu />
      </div>
    </aside>
  );
}

/* ── Mobile top bar ────────────────────────────────────────────────────── */

function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b-[1.5px] border-border bg-background/90 px-4 backdrop-blur-md pt-[env(safe-area-inset-top)] lg:hidden">
      <Brand />
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <div className="w-44">
          <AccountMenu align="end" />
        </div>
      </div>
    </header>
  );
}

/* ── Mobile bottom navigation ──────────────────────────────────────────── */

function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t-[1.5px] border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      {NAV_ITEMS.map(({ href, label, shortLabel, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            // min-h-14 keeps the tap area comfortably past 44px.
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-2xs font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon
              className="size-5 shrink-0"
              strokeWidth={active ? 2.4 : 1.8}
              aria-hidden="true"
            />
            {/* Icons always carry a text label — icon-only nav hurts discoverability. */}
            <span className="max-w-full truncate">{shortLabel ?? label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* ── Shell ─────────────────────────────────────────────────────────────── */

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to main content
      </a>

      <DesktopSidebar />
      <MobileTopBar />

      <div className="lg:pl-64">
        <main
          id="main-content"
          tabIndex={-1}
          className={cn(
            "mx-auto w-full max-w-6xl px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8",
            // Clears the fixed bottom nav on mobile so nothing is hidden under it.
            "pb-24 lg:pb-8",
          )}
        >
          {children}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
