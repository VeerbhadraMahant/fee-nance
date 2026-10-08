# Fee-Nance

Most people track personal spending in one app and split group bills in another, so neither view is complete. Fee-Nance puts both in one place: personal income, expenses and budgets alongside shared group expenses and settlements, over a single account and a single set of categories.

Built with Next.js 16 (App Router) on Supabase: Postgres with row-level security, Supabase Auth with Google sign-in, and an optional Redis cache. Next.js is the only server. Currency is INR only.

## Status

This is coursework, actively being refactored. What exists today works end to end — auth, personal finance CRUD, group splits, balances, settlements and the analytics dashboards are all live against real data. What does not exist yet is documented honestly in [Known limitations](#known-limitations); the full remediation plan lives in `fee-nance-updates.md`, and the Phase 0 audit that produced it is in `docs/audit/`.

## Architecture

```
src/app/(app)/*          React Server Components — the authenticated shell
src/app/api/private/*    Route handlers: auth → Zod validation → Supabase (as the user) → JSON
src/app/auth/*           Google OAuth callback and sign-out
src/lib/supabase/*       Server and browser Supabase clients (@supabase/ssr)
src/lib/data/*           Row → API-shape mappers and shared group queries
src/lib/cache.ts         Redis read-through cache with per-user versioned invalidation
src/lib/*                Pure helpers: split allocation, money rounding, forecasting,
                         recurrence, health score, tax, goals, recurring detection
src/proxy.ts             Session refresh + sign-in gate for every page and /api/private
supabase/migrations/*    The schema, row-level security policies and SQL functions
```

Data flows one way: a client component calls a `/api/private` route; the handler verifies the session JWT, validates input with Zod, and queries Supabase **as that user**, so row-level security in Postgres decides what they can read or write. Aggregations (totals, budget spend, the insights window functions) run as SQL functions in the database; writes that touch several tables (a group expense with its payers and splits) run as one SQL transaction. Results go back as plain JSON in the same shape the frontend has always used.

Read-heavy routes (dashboard, analytics, insights, health, report, tax, group analytics) are cached in Redis when it's configured. Every write bumps the affected users' cache version, so a cached answer is never served after a change to the data it was computed from.

### Authorization model

Three layers, from convenience to guarantee:

1. **`src/proxy.ts`** refreshes the Supabase session on every request and sends signed-out visitors to `/login` (pages) or answers `401` (API). It is a convenience gate, never relied on for ownership.
2. **Every route handler** resolves the user itself with `supabase.auth.getClaims()`, which verifies the JWT rather than trusting the cookie.
3. **Row-level security** in Postgres is the real boundary. Personal tables (transactions, budgets, goals, categories) are visible only to their owner. Group tables are visible only to members, checked by a `SECURITY DEFINER` helper so the policy can't recurse. Someone else's id therefore comes back as `404`, the same as an id that doesn't exist. Creating, joining and leaving groups and adding group expenses go through SQL functions that check membership and that the parts sum to the total before writing anything.

### Split allocation

`lib/split.ts` implements four strategies behind `computeShares`:

- **equal** — `total / n` rounded to 2 dp, with the residual pushed onto the last member so the parts sum to the total.
- **custom** — caller supplies each share; the sum must equal the total after rounding.
- **percentage** — `total × pct / 100` per member; percentages must sum to 100 and the resulting shares must sum to the total, otherwise the write is rejected.
- **itemized** — each line of the bill is divided among the members who shared it. Lines flagged `proportional` (tax, tip, service charge) are spread by each member's priced subtotal rather than evenly.

Itemized allocation works in **integer paise** and distributes the residual by the largest-remainder rule, rotating which member receives the spare paisa from one line to the next — so with a bill of many indivisible items nobody systematically absorbs the rounding. It is the one path in the codebase that already does what backlog item M1 wants everywhere, because it is where the arithmetic is densest.

Note the inconsistency this creates: equal splits push the residual onto the last member, itemized splits use largest-remainder. Reconciling the two is backlog item M5.

All four compare sums with exact equality *after* rounding to 2 dp, not with an epsilon tolerance. Balances are then folded per member and reduced to a minimal set of pairwise transfers by a greedy debtor/creditor match.

## Tech Stack

- Next.js 16 (App Router) + React 19
- TypeScript
- Tailwind CSS 4, Radix UI primitives, `next-themes`, `sonner`
- Recharts, plus a hand-rolled Sankey layout in the analytics suite
- Supabase: Postgres 15+ with row-level security, Supabase Auth (Google OAuth), `@supabase/ssr`
- Upstash Redis (optional cache)
- Zod 4

## Features

### Personal finance
- Categories: 7 seeded system categories plus user-defined ones
- Transactions: create, edit, delete, filter by date range and category
- Budgets: monthly, quarterly and yearly cycles, optionally scoped to one category
- Recurring transactions: monthly and yearly, generated on demand via `POST /api/private/transactions/recurring/run`
- Income / expense summary and running balance

### Analytics
- Financial flow Sankey (gross income → expenses / savings)
- Monthly trajectory chart, line or grouped-bar
- Expenditure composition donut with category breakdown
- Quarterly overview bars with savings annotations
- Efficiency report: savings rate, expense ratio, deduction rate, overall rating
- KPI cards: gross income, deductions, net income, expenses, net savings
- Date range presets — week, month, quarter, YTD, year, custom

### Insights
- 90-day cash-flow projection built from recurring rules plus a discretionary
  spend rate, with a confidence band that widens with distance
- Predicted date the balance runs out, when there is one
- Outlier detection: expenses judged against the trailing run of their own
  category, not against a global average
- Duplicate charge detection: the same amount and description inside 48 hours
- Category drift against each category's own three-month average

Outliers, duplicates and drift are Postgres window functions
(`insights_outliers`, `insights_duplicates`, `insights_drift` in
`supabase/migrations/`), ported from the original MongoDB `$setWindowFields`
pipelines with the same windows and thresholds.

### Planning (ported from HackMatrix / FinPilot)
- **Financial health score** (dashboard and monthly report): five weighted
  pillars computed from the ledger in `lib/health-score.ts`. FinPilot's debt
  pillar is replaced by budget adherence, since Fee-Nance records no loans.
- **Savings goals** (`/goals`): targets, contributions, required monthly
  amount for a target date, and a what-if slider per goal. Projections are
  set against the user's real average monthly surplus.
- **Tax planner** (`/tax`): new vs old regime for FY 2026-27 with 87A rebate
  and marginal relief, deductions pre-filled from transaction titles, and the
  old-regime break-even. Surcharge and senior-citizen limits are not modelled.
- **Monthly report** (`/report`): a one-page statement with a print/PDF stylesheet.
- **Unruled recurring charges** (Insights): repeating payees with no recurring
  rule, plus overlapping subscriptions (two video services, etc.).
- **Command palette**: `⌘K` / `Ctrl+K` to jump to any page or start an action.

### Group expenses
- Create a group (you become owner) or join one with an 8-character invite code
- Multi-payer expenses: several people can have paid toward one bill
- Equal, custom-amount, percentage and itemized splits, validated against the total
- Itemized splitting: enter the lines of a bill and tick who shared each one;
  tax and tip lines spread in proportion to what each person ordered. Optional
  receipt scanning pre-fills the lines — who shared what is never inferred
- Per-member balance computation
- Simplified pairwise settlement suggestions
- Manual settlement entries, optionally idempotent via an `idempotencyKey`

### Group analytics
- Cross-group net balance Sankey (groups you owe vs groups that owe you)
- Per-group spend timeline with stacked member bars
- Member spend share donut and net position bars
- Top expenses table
- Split type breakdown
- Settlement flow Sankey with proportional per-node flow sizing

### Auth
- Google sign-in only, through Supabase Auth. The same button signs up and signs in
- A `profiles` row is created by a database trigger on first sign-in, from the Google name, email and avatar
- Protected app shell and private API routes; sessions refresh automatically in `src/proxy.ts`

## Setup and Run

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Apply the schema: either paste `supabase/migrations/*.sql` into the SQL editor **in filename order**, or with the Supabase CLI run `supabase link` then `supabase db push`.
3. **Google sign-in.** In Google Cloud Console create an OAuth client (type *Web application*) and add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorised redirect URI. In Supabase go to *Authentication → Sign In / Providers → Google*, enable it, and paste the client ID and secret.
4. In *Authentication → URL Configuration* set the Site URL to your app URL and add `http://localhost:3000/**` (and your deployed URL with `/**`) to the redirect allow-list.

### 2. Environment

```bash
cp .env.example .env.local
```

| Variable | Required | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL (*Project Settings → API*) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | The anon / publishable key. Public by design; row-level security protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | seed only | Bypasses RLS. Used by `npm run seed:demo` only, never by the app. Keep it out of the browser and out of git |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | no | Upstash Redis for the cache. Leave both unset to run without a cache |
| `RECEIPT_EXTRACTOR` | no | Selects an OCR implementation from `src/lib/receipt/registry.ts`; unset or `none` disables receipt scanning |
| `LOG_LEVEL` | no | `debug`, `info`, `warn` or `error` |

Google's client ID and secret live in the Supabase dashboard, not in this app's environment.

### 3. Run

```bash
npm install
npm run dev            # http://localhost:3000
```

Sign in with Google once, then optionally fill your account with a year of demo data:

```bash
npm run seed:demo -- you@gmail.com
```

## Scripts

- `npm run dev` / `build` / `start` — Next.js
- `npm run lint`, `npm run format` — ESLint (with `--fix`)
- `npm run verify:calc` — the pure money modules: split allocation, forecast, tax, health score, goals, recurring detection, plus route error mapping. No database needed
- `npm run verify:db` — applies the migrations to an embedded Postgres (PGlite) and checks row-level security, every SQL function and the group invariants. No Supabase project needed

## Routes

| Path | Purpose |
|---|---|
| `/` | Landing page |
| `/login` | Google sign-in |
| `/auth/callback`, `/auth/signout` | OAuth return and sign-out |
| `/dashboard` | Balance, trends, recent activity |
| `/finance` | Transactions, budgets, categories |
| `/groups`, `/groups/[groupId]` | Group list and group workspace |
| `/analytics` | Deeper breakdowns and trajectory |
| `/insights` | Cash-flow forecast, unusual spending, duplicate charges, unruled subscriptions |
| `/goals`, `/tax`, `/report` | Savings goals, tax planner, printable monthly report |
| `/profile` | Account details and preferences (reached from the account menu) |

Private APIs live under `/api/private/*`. They are enumerated in `docs/private-api-reference.md`.

## Demo Seed Data

`npm run seed:demo -- <email>` fills an account that has already signed in with a year of salary, rent, groceries, subscriptions, a duplicate charge, budgets, three goals, and a "Hostel Squad" group shared with two demo friends (`aditi.rao@feenance.demo`, `karan.verma@feenance.demo`, created in Supabase Auth; they can't sign in). It refuses to touch an account that already has data unless you pass `--reset`.

## Documentation Index

> The schema of record is now `supabase/migrations/`. Documents under `docs/` that describe MongoDB collections, aggregation pipelines or Mongo-to-relational mappings describe the design before the move to Supabase, and are kept as coursework history.

Overview:
- `docs/what-is-fee-nance.md` — what the project is and who it is for
- `docs/fee-nance-features.md` — full implemented-feature list
- `docs/architecture-module-flow.md` — module and request flow

Database:
- `docs/DBMS.md` — consolidated DBMS write-up
- `docs/er-diagram.md`, `docs/relational-mapping.md`
- `docs/dbms-query-mapping.md`, `docs/mongo-relational-equivalents.md`
- `docs/viva-notes-mongodb-vs-relational.md`

API and operations:
- `docs/private-api-reference.md`
- `docs/insights-pipelines.md` — the `$setWindowFields` pipelines behind `/insights`
- `docs/secrets-policy.md`
- `docs/demo-script.md`, `docs/manual-qa-checklist.md`

Phase 0 audit (read-only findings that drive the backlog):
- `docs/audit/codebase-map.md` — every route, model and helper
- `docs/audit/money-path.md` — where amounts are read, written and compared
- `docs/audit/authorization.md` — per-route ownership check table
- `docs/audit/split-allocation.md` — remainder handling
- `docs/audit/balance-settlement.md` — query patterns and round-trips
- `docs/audit/dead-code.md` — unused symbols and unimplemented claims

## Known limitations

- **Money is `numeric(15,2)` in Postgres but `number` in TypeScript.** Storage is exact; arithmetic in the app still relies on `roundCurrency` after every operation. Moving the app to integer paise behind a `Money` value object is still Phase 1. Itemized splitting already works in integer paise internally.
- **The forecast double-counts recurring expenses approximately.** Generated occurrences carry no reference to the rule that produced them, so the projection subtracts each rule's rate from the discretionary rate instead of excluding the occurrences by id. Exact over a long window, approximate over a short one; backlog item F8.
- **Percentage splits have no explicit remainder rule.** They reject inputs whose rounded shares miss the total instead of allocating the residual.
- **No test runner.** `verify:calc` and `verify:db` are standing checks, not a Vitest suite.
- **Missing endpoints.** Group expenses and settlements can't be edited or deleted.
- **Invite codes use Postgres `random()`**, not a cryptographic source. They are 8 characters from a 32-letter alphabet and only grant membership of one group.
- **Redis invalidation is per user.** A write bumps the version of everyone it affects (all members, for group writes); entries otherwise expire after 5 minutes.

---

## Data Model

The schema lives in `supabase/migrations/20261008000001_schema.sql`; the functions in `…000002_functions.sql`.

| Table | Holds | Key constraints |
|---|---|---|
| `profiles` | One row per auth user: name, email, avatar, preferences | PK = `auth.users.id`, created by trigger |
| `categories` | 7 shared system categories plus each user's own | unique `(user_id, name, type)` with `NULLS NOT DISTINCT` |
| `transactions` | Income and expenses, with an optional recurring rule | `amount > 0`; category `ON DELETE SET NULL` |
| `budgets` | Spending limits over a period, optionally for one category | `period_end > period_start` |
| `goals` | Savings targets and progress | `saved_amount >= 0` |
| `groups`, `group_members` | Shared ledgers and who's in them | PK `(group_id, user_id)`; role `owner`/`member` |
| `group_expenses` | A shared bill; itemized line items as `jsonb` provenance | cascades from `groups` |
| `group_expense_payers`, `group_expense_splits` | Who paid and who owes what, per expense | PK `(expense_id, user_id)`; sums checked by `create_group_expense` |
| `settlements` | Repayments between members | `from <> to`; unique `(group_id, created_by, idempotency_key)` |

Every table has row-level security enabled; the policies are in the same migration file.
