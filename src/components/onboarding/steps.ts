/**
 * The first-run tour. Each step belongs to a page and, usually, points at one
 * element on it, found by its `data-tour` attribute (PageHeader, the nav and
 * the search button carry them). A step with no target is a centred card.
 *
 * Targets are tried in order and the first one that is actually visible wins,
 * which is how one step covers both the desktop sidebar and the mobile bottom
 * bar. If none can be found the step still shows, centred, so a changed page
 * never breaks the tour.
 */

export interface TourStep {
  id: string;
  /** Page the step lives on. The tour navigates there first. */
  route?: string;
  /** `data-tour` values, in order of preference. */
  targets?: string[];
  title: string;
  body: string;
  /** Short list under the body. */
  points?: string[];
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    route: "/dashboard",
    title: "Welcome to Fee-Nance",
    body: "A two-minute look around. Fee-Nance keeps your own money and the money you share with friends in one place. You can leave at any time, and replay this from your account menu.",
  },
  {
    id: "nav",
    route: "/dashboard",
    targets: ["nav"],
    title: "Everything is one tap away",
    body: "Track your money, see what it means, and plan ahead. Every page is in here.",
    points: ["Track: Home, Money, Groups", "Understand: Trends, Insights", "Plan: Copilot, Goals, Tax"],
  },
  {
    id: "dashboard",
    route: "/dashboard",
    targets: ["page-header"],
    title: "Your dashboard",
    body: "Your balance, how it moved, where it went, and a health score built from five things you can improve.",
    points: [
      "Change the date range at the top",
      "Your share of group bills counts as your spending, so the numbers stay honest",
    ],
  },
  {
    id: "transactions",
    route: "/finance",
    targets: ["page-action", "page-header"],
    title: "Log money in seconds",
    body: "Add income or an expense with a title, amount and category. Do it with no connection too: it is kept on your phone and sent when you are back online.",
    points: [
      "Import a bank statement (CSV) and duplicates are skipped",
      "Mark rent or salary as repeating and it posts itself",
      "Budgets and categories are tabs on this page",
    ],
  },
  {
    id: "groups",
    route: "/groups",
    targets: ["page-action", "page-header"],
    title: "Split bills with friends",
    body: "Create a group, share the invite code, and add expenses. Split equally, by percentage, by exact amounts, or item by item with GST.",
    points: [
      "Shares always add up to the exact paisa",
      "Suggested payments settle everyone in the fewest transfers",
      "Pay via UPI opens your payment app with the amount filled in",
    ],
  },
  {
    id: "insights",
    route: "/insights",
    targets: ["page-header"],
    title: "It notices things for you",
    body: "Double charges, unusual spends, overlapping subscriptions, and a 90-day forecast of your balance with a likely range.",
  },
  {
    id: "tax",
    route: "/tax",
    targets: ["page-header"],
    title: "Old tax regime or new?",
    body: "Compares both for FY 2026-27, recommends one, and tells you how many extra deductions it would take for the other to win.",
  },
  {
    id: "goals",
    route: "/goals",
    targets: ["page-action", "page-header"],
    title: "Save towards something",
    body: "Set a target and see when you will reach it at your real monthly savings. Drag the what-if slider to see what saving more changes.",
  },
  {
    id: "copilot",
    route: "/copilot",
    targets: ["page-header"],
    title: "Ask your own ledger",
    body: "Ask things like “How am I doing this month?” or say “Add ₹450 for groceries yesterday”. Answers come from your data, and nothing is saved until you confirm it.",
  },
  {
    id: "search",
    route: "/copilot",
    targets: ["search"],
    title: "Jump anywhere",
    body: "Search pages and actions. On a keyboard, press Ctrl or ⌘ and K from anywhere.",
  },
  {
    id: "offline",
    route: "/dashboard",
    title: "Works with no signal",
    body: "Install Fee-Nance on your phone (Add to Home Screen) and it opens without a connection. Changes you make offline wait on the device and are sent, once each and in order, when you are back online.",
  },
  {
    id: "done",
    route: "/dashboard",
    title: "You are all set",
    body: "Start by adding your first transaction. You can replay this tour any time from your account menu or the Profile page.",
  },
];
