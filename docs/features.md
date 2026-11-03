# Features and status

The live list of what Fee-Nance does, and how complete each part is. Update this file in the same change that ships or breaks a feature.

Status key: **Done** works end to end · **Partial** works with the gaps listed · **Not started**

## Account

| Feature | Status | Notes |
|---|---|---|
| Google sign-in (Supabase Auth) | Done | One button signs up and signs in. No email/password |
| Profile created on first sign-in | Done | Database trigger copies name, email and avatar from Google |
| Profile and preferences | Done | Name and default dashboard range |
| Protected pages and APIs | Done | `src/proxy.ts` gate, JWT check in every route, RLS in Postgres |

## Personal finance

| Feature | Status | Notes |
|---|---|---|
| Transactions: create, edit, delete, filter, sort, paginate | Done | |
| Categories: 7 system plus custom | Done | Deleting a category leaves its transactions uncategorised |
| Budgets: monthly, quarterly, yearly, overall or per category | Done | |
| Budget pacing (spend against time elapsed) | Not started | Backlog F10 |
| Recurring transactions (monthly, yearly) | Partial | Generated only from a dashboard button; month-end dates drift (31 Jan → 3 Mar); concurrent runs can duplicate occurrences |
| CSV export | Done | Transactions and group ledgers |
| CSV import | Not started | Backlog F13 |

## Groups

| Feature | Status | Notes |
|---|---|---|
| Create, join by invite code, leave | Partial | A member can leave while owing or being owed, which breaks settle-up; the owner leaving deletes the group for everyone |
| Shared expenses with several payers | Done | |
| Equal split | Partial | Always splits across every member; no way to choose participants |
| Custom, percentage and itemized splits | Done | Itemized works in integer paise, with tax and tip spread proportionally |
| Receipt scanning for itemized splits | Partial | The extractor interface and route exist, but no extractor is registered, so the scan button never shows |
| Edit or delete a group expense | Not started | |
| Balances and suggested settlements | Partial | Greedy debtor/creditor matching: at most n−1 payments, not guaranteed minimal |
| Record a settlement | Partial | Idempotent by key; any member can record one between any two members |
| Edit or delete a settlement | Not started | |
| UPI settle-up links | Not started | |
| Group share counted in personal budgets and totals | Not started | Backlog F5 — the product's central idea |

## Analytics and insights

| Feature | Status | Notes |
|---|---|---|
| Dashboard: balance, trends, category breakdown, recent activity | Done | Personal transactions only |
| Analytics: Sankey money flow, trajectory, composition, quarterly, efficiency | Done | |
| Group analytics: cross-group Sankey, timelines, member shares | Done | |
| 90-day cash-flow forecast with confidence band | Done | Approximates the recurring/discretionary overlap (backlog F8) |
| Outliers, duplicate charges, category drift | Done | SQL window functions |
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
| Ledger-grounded Q&A (Gemini) | Partial | Read-only tools over personal data; no group data, no rate limit, no streaming |
| Draft entries from free text | Not started | Backlog F14 |

## Platform

| Feature | Status | Notes |
|---|---|---|
| Redis cache with versioned invalidation | Done | Optional; fails open |
| Command palette (Ctrl/⌘+K) | Done | |
| Light and dark themes, responsive layout | Done | |
| Installable app, push or email reminders | Not started | |
| CI: lint, typecheck, calculation and database checks, build | Done | |
| Unit test runner (Vitest) | Not started | `verify:calc` and `verify:db` are standing checks |
