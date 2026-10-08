import {
  ArrowLeftRight,
  ChartPie,
  FileText,
  Goal,
  Landmark,
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
  /** Extra words the command palette should match on. */
  keywords?: string;
}

/** Day-to-day destinations: recording and reviewing money. */
export const TRACK_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    shortLabel: "Home",
    icon: LayoutDashboard,
    description: "Balance, health score and recent activity",
    keywords: "home overview summary",
  },
  {
    href: "/finance",
    label: "Transactions",
    shortLabel: "Money",
    icon: ArrowLeftRight,
    description: "Income, expenses, budgets and categories",
    keywords: "ledger budgets categories expense income",
  },
  {
    href: "/groups",
    label: "Groups",
    icon: Users,
    description: "Shared expenses and settlements",
    keywords: "split friends settle",
  },
  {
    href: "/analytics",
    label: "Analytics",
    shortLabel: "Trends",
    icon: ChartPie,
    description: "Deeper breakdowns and trajectory",
    keywords: "charts sankey trends",
  },
  {
    href: "/insights",
    label: "Insights",
    icon: Radar,
    description: "Forecast, subscriptions and unusual activity",
    keywords: "forecast anomalies recurring subscriptions",
  },
];

/** Forward-looking tools, ported from HackMatrix. */
export const PLAN_ITEMS: NavItem[] = [
  {
    href: "/goals",
    label: "Goals",
    icon: Goal,
    description: "Savings targets and when you'll reach them",
    keywords: "save target emergency fund",
  },
  {
    href: "/tax",
    label: "Tax planner",
    shortLabel: "Tax",
    icon: Landmark,
    description: "New vs old regime, with your deductions",
    keywords: "income tax regime 80c 80d deductions",
  },
  {
    href: "/report",
    label: "Monthly report",
    shortLabel: "Report",
    icon: FileText,
    description: "A printable statement for any month",
    keywords: "statement pdf print export",
  },
];

export const NAV_SECTIONS = [
  { label: "Track", items: TRACK_ITEMS },
  { label: "Plan", items: PLAN_ITEMS },
];

export const ALL_NAV_ITEMS = [...TRACK_ITEMS, ...PLAN_ITEMS];

/**
 * The mobile bottom bar holds four destinations plus "More" — five slots is
 * the ceiling for a usable bottom bar. Everything else lives in the More
 * sheet, which lists every destination so nothing is reachable only by
 * search.
 */
export const BOTTOM_BAR_HREFS = ["/dashboard", "/finance", "/groups", "/goals"];

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
