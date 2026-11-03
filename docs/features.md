# Features and status

The live list of what Fee-Nance does, and how complete each part is. Update this file in the same change that ships or breaks a feature.

Status key: **Done** works end to end · **Partial** works with the gaps listed · **Not started**

"Verified" in the notes means covered by `npm run verify:calc` or `npm run verify:db`. Anything else was type-checked and linted but not exercised against a live Supabase project or in a browser.

## Account

| Feature | Status | Notes |
|---|---|---|
| Google sign-in (Supabase Auth) | Done | One button signs up and signs in |
| Email sign-in | Done | Email and password, or a one-time link emailed to you (also the way back in if you forget the password). Needs the Email provider on in Supabase; confirmation emails use Supabase's email service, which is rate limited unless you add your own SMTP. Not tried against a live project |
| Profile created on first sign-in | Done | Database trigger copies name, email and avatar from Google. Verified |
| Profile and preferences | Done | Name, default dashboard range, UPI ID, whether group shares count |
| Protected pages and APIs | Done | `src/proxy.ts` gate, JWT check in every route, RLS in Postgres. Verified |
| Installable web app | Done | Manifest with PNG and maskable icons, iOS home-screen metadata, long-press shortcuts (Add expense, Groups, Copilot). Not tested on a real device |
| Works offline | Partial | Pages you've opened, and your last-seen data, open with no connection. Logging, editing and deleting transactions, adding group expenses and recording payments are saved on the device and sync when you're back online, in order, and only when something is waiting. See [`offline.md`](offline.md) for exactly what does and doesn't work. Logic verified; not tested in a real browser |
| Mobile layout | Partial | Safe-area padding for notches and the home indicator, 16px form fields (no iOS zoom on focus), 44px tap targets on touch screens, no tap delay, standalone-mode scrolling. Checked by reading the code, not on devices |

## Personal finance

| Feature | Status | Notes |
|---|---|---|
| Transactions: create, edit, delete, filter, sort, paginate | Done | |
| Categories: 7 system plus custom | Done | Deleting a category leaves its transactions uncategorised. A transaction or budget can't use another user's category (RLS). Verified |
| Budgets: monthly, quarterly, yearly, overall or per category | Done | Spend comes from `budget_spend` and includes your share of group expenses |
| Budget pacing | Done | "48% of the period gone", with a projection when spending runs ahead of the calendar. Verified |
| Recurring transactions (monthly, yearly) | Done | Generated automatically once per browser session and from the dashboard button. Month-end rules stay at month-end (31 Jan → 28 Feb → 31 Mar). One occurrence per rule per date, enforced by a unique index, so concurrent runs are harmless. Verified. No background scheduler: entries appear when the app is next opened |
| CSV export | Done | Transactions and group ledgers |
| CSV statement import | Done | Column mapping, preview, duplicate detection by count. Day-first dates, debit/credit or signed columns, Dr/Cr suffixes. Up to 500 rows at a time; imported rows are uncategorised. Parsing verified |

## Groups

| Feature | Status | Notes |
|---|---|---|
| Create, join by invite code | Done | |
| Leave a group | Done | Refused while you owe or are owed anything. An owner who leaves hands ownership to the longest-standing member; the last member out deletes the group. Verified |
| Delete a group | Done | Owner only, for everyone |
| Shared expenses with several payers | Done | |
| Equal split | Done | Choose who shared it; spare paise go out one each. Verified for 2–12 people |
| Custom, percentage and itemized splits | Done | Percentage and itemized use largest-remainder allocation in paise. Verified |
| Expense category | Done | Shared expense categories only, so each member's share lands in their own budget for it |
| Edit or delete a group expense | Done | The person who added it, or the group owner. Verified |
| Receipt scanning for itemized splits | Partial | Gemini reads the photo and fills in the lines; you still choose who shared each. Rate limited. Not tested against the live model |
| Balances and suggested settlements | Done | Greedy debtor/creditor matching: at most n−1 payments, not guaranteed minimal. A former member with a leftover balance (from before the leave rule) stays visible |
| Record a settlement | Done | Only the payer or payee can record one. Idempotent: the dialog sends a key. Verified |
| Delete a settlement | Done | Payer, payee or whoever recorded it. Verified |
| UPI settle-up links | Done | "Pay via UPI" opens the payer's UPI app with payee and amount filled in, using the payee's UPI ID. Recording the payment stays a separate step. Link format verified; not tried in a real UPI app |
| Group share counted in personal budgets and totals | Done | Your share of each group expense appears as spending in the expense's category, on its date. What you *paid* is not counted. Turn off under Profile → Groups & payments. Verified. Transaction list totals show transactions only |

## Analytics and insights

| Feature | Status | Notes |
|---|---|---|
| Dashboard: balance, trends, category breakdown | Done | Totals include group shares; the recent-activity list shows transactions only |
| Analytics: Sankey money flow, trajectory, composition, quarterly, efficiency | Done | |
| Group analytics: net position per group, paid vs owed, timelines, member shares, split methods | Done | Bar and donut charts. An earlier custom Sankey was replaced by bars because they reflow on phones |
| 90-day cash-flow forecast with confidence band | Done | Approximates the recurring/discretionary overlap (backlog F8) |
| Outliers, duplicate charges, category drift | Done | SQL window functions over your own transactions |
| Unruled recurring payees and overlapping subscriptions | Done | |
| Financial health score | Done | Five weighted pillars |
| Monthly report with print stylesheet | Done | |

## Planning

| Feature | Status | Notes |
|---|---|---|
| Savings goals with projections and what-if slider | Done | |
| Tax planner: new vs old regime, FY 2026-27 | Done | Surcharge, senior-citizen limits and capital gains not modelled |

## Copilot

| Feature | Status | Notes |
|---|---|---|
| Ledger-grounded Q&A (Gemini) | Done | Tools: snapshot, category spend, trend, transaction search, budgets, goals, recurring rules, unusual activity, group balances |
| Draft entries from free text | Done | "Add ₹450 for groceries yesterday" produces a draft card; nothing is saved until you press Add. Saving goes through the ordinary transactions route |
| Rate limiting | Done | 30 questions per user per hour (copilot), 20 scans per hour (receipts). Shared across servers with Upstash; per-instance memory without it |
| Streaming replies | Not started | |

## Platform

| Feature | Status | Notes |
|---|---|---|
| Redis cache with versioned invalidation | Done | Optional; fails open |
| Command palette (Ctrl/⌘+K) | Done | |
| First-run onboarding | Done | A welcome dialog on first visit to the dashboard, then a 12-step guided tour that spotlights the real screens and moves between pages. Replay from the account menu, the command palette or Profile → Getting started. Remembered per account. Logic type-checked; not yet watched in a real browser |
| Sample data | Done | One click fills an empty account with three months of made-up transactions, two budgets and two goals. Tagged `is_demo`, so "Remove sample data" deletes only those. Refused on an account that already has transactions. Removal verified against the database |
| Product film on the landing page | Done | A 34-second Remotion film (`src/remotion/`): logging money, budget pace, a group split, insights and forecast, offline sync. Played live on the landing page by `@remotion/player`, so there is no video file; loads only when scrolled near; shows a still frame under reduced motion. Made-up data, no sound. `npm run video:studio` to edit it, `npm run video:render` for an MP4 |
| Public product tour at `/tour` | Done | A standalone page (`public/tour.html`) with fictional data and live demos of each feature. Needs no sign-in. Replicates the app; it is not the app |
| Light and dark themes, responsive layout | Done | |
| CI: lint, typecheck, calculation and database checks, build | Done | |
| Unit test runner (Vitest) | Not started | `verify:calc` and `verify:db` are standing checks |
| Reminders by email or push | Not started | Needs a provider (Resend, or web-push keys) |
| Background sync while the app is closed | Not started | Not supported on iOS; sync runs when the app is open |
| Multiple currencies | Not started | INR only |

## Not planned

Event-sourced ledger, amendment trail, time-travel balances, settlement handshake and disputes (backlog F1–F4, F12). See `TODO.md`.
