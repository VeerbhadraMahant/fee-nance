import {
  ArrowLeftRight,
  ChartPie,
  LayoutDashboard,
  Radar,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile bottom bar, where width is tight. */
  shortLabel?: string;
  icon: LucideIcon;
  description: string;
}

/**
 * Top-level destinations. Capped at 5 — that is the ceiling for a usable
 * bottom navigation bar, and it keeps the sidebar scannable.
 *
 * Profile is deliberately absent: it lives in the account menu in the sidebar
 * footer, which is where people look for it anyway, and holding it here would
 * have cost Insights its slot.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    shortLabel: "Home",
    icon: LayoutDashboard,
    description: "Balance, trends and recent activity",
  },
  {
    href: "/finance",
    label: "Transactions",
    shortLabel: "Money",
    icon: ArrowLeftRight,
    description: "Income, expenses, budgets and categories",
  },
  {
    href: "/groups",
    label: "Groups",
    icon: Users,
    description: "Shared expenses and settlements",
  },
  {
    href: "/analytics",
    label: "Analytics",
    shortLabel: "Trends",
    icon: ChartPie,
    description: "Deeper breakdowns and trajectory",
  },
  {
    href: "/insights",
    label: "Insights",
    icon: Radar,
    description: "Cash-flow forecast and unusual activity",
  },
];

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
