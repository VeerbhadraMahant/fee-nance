# Fee-Nance

Most people track personal spending in one app and split group bills in another, so neither view is complete. Fee-Nance puts both in one place: personal income, expenses and budgets alongside shared group expenses and settlements, over a single account and a single set of categories.

Built with Next.js 16 (App Router), MongoDB and Mongoose. Currency is INR only.

## Status

This is coursework, actively being refactored. What exists today works end to end — auth, personal finance CRUD, group splits, balances, settlements and the analytics dashboards are all live against real data. What does not exist yet is documented honestly in [Known limitations](#known-limitations); the full remediation plan lives in `fee-nance-updates.md`, and the Phase 0 audit that produced it is in `docs/audit/`.

## Architecture

```
src/app/(app)/*          React Server Components — the authenticated shell
src/app/api/private/*    Route handlers: auth guard → Zod validation → Mongoose → JSON
src/lib/*                Pure helpers: split allocation, money rounding, forecasting,
                         recurrence stepping, access checks
src/lib/receipt/*        The OCR boundary — an interface and a registry, no vendor
src/models/*             Mongoose schemas (7 collections)
middleware.ts            Session gate over /dashboard, /finance, /groups, /analytics,
                         /insights, /profile and /api/private
```

Data flows one way: a client component calls a `/api/private` route, the handler resolves the session user, validates input with Zod, scopes the query to that user (or to a group they belong to), and returns plain JSON. Aggregation for the dashboards runs as MongoDB pipelines where possible; group balance folding currently happens in memory.

There is deliberately **no service layer yet** — business logic lives in the route handlers, with `lib/split.ts` and `lib/money.ts` as shared pure functions. Introducing one is Phase 5 of the backlog.

### Authorization model

Two independent layers:

1. **`middleware.ts`** proves a session exists for protected paths. It performs no authorization beyond that and is never relied on for ownership.
2. **Every handler re-checks access itself.** Personal resources (transactions, budgets, categories, profile) are queried with `userId` in the filter, so a foreign id simply returns 404. Group resources load the group and assert the session user is a current member before any read or write; payers and split participants are validated as members at write time.

Known gaps, tracked as Phase 2 of the backlog: group and category routes return **403** rather than 404 for inaccessible ids (which leaks their existence), membership is checked after fetching rather than in the query, the guard block is copy-pasted across six group routes, and path parameters are validated by ObjectId parsing rather than by Zod.

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
- NextAuth v4 (credentials + optional Google OAuth)
- MongoDB Atlas + Mongoose 9
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

All four are MongoDB `$setWindowFields` pipelines and are documented, with the
index each one rides, in `docs/insights-pipelines.md`. **Requires MongoDB 5.0+.**

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
- Email/password registration and login (bcrypt, JWT sessions)
- Google OAuth, enabled only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set
- Protected app shell and private API routes

## Setup and Run

1. Install dependencies

```bash
npm install
```

2. Create a local env file

```bash
cp .env.example .env
```

3. Fill the required variables in `.env`
- `MONGODB_URI`
- `NEXTAUTH_URL` (usually `http://localhost:3000`)
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID` (optional)
- `GOOGLE_CLIENT_SECRET` (optional)
- `RECEIPT_EXTRACTOR` (optional) — selects an OCR implementation from `src/lib/receipt/registry.ts`; unset or `none` disables receipt scanning
- `LOG_LEVEL` (optional)

`MONGODB_URI` must point at **MongoDB 5.0 or newer** — `/insights` uses `$setWindowFields`. Every other page works on older servers.

4. Seed demo data

```bash
npm run seed
```

5. Run in development

```bash
npm run dev
```

6. Open `http://localhost:3000`

## Scripts

- `npm run dev` — start the development server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — lint
- `npm run format` — lint with `--fix`
- `npm run seed` — seed demo data
- `npm run verify:calc` — check the split allocation and forecast arithmetic (no database needed)
- `npm run dbms:report` — regenerate `docs/dbms-report-output.json`

There is no test runner yet; adding Vitest is Phase 4 of the backlog.
`npm run verify:calc` is a stopgap covering the two pure money modules —
itemized split allocation and the cash-flow forecast — and is what should
migrate into Vitest first.

## Routes

| Path | Purpose |
|---|---|
| `/` | Landing page |
| `/login`, `/register` | Authentication |
| `/dashboard` | Balance, trends, recent activity |
| `/finance` | Transactions, budgets, categories |
| `/groups`, `/groups/[groupId]` | Group list and group workspace |
| `/analytics` | Deeper breakdowns and trajectory |
| `/insights` | Cash-flow forecast, unusual spending, duplicate charges |
| `/profile` | Account details and preferences (reached from the account menu) |

Private APIs live under `/api/private/*`. They are enumerated in `docs/private-api-reference.md`.

## Demo Seed Data

`npm run seed` creates nine users, system categories, a year of transactions, budgets, groups, group expenses and settlements. Password is `Demo@1234` for every account:

`alex@` · `riya@` · `kabir@` · `priya@` · `arjun@` · `nisha@` · `dev@` · `sneha@` · `rahul@` — all `@feenance.demo`

## Documentation Index

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

Confirmed by the Phase 0 audit, not speculation:

- **Money is stored as floating-point rupees.** Correctness depends on `roundCurrency` being called after every operation, and `balances`/`analytics` still use epsilon thresholds where `split.ts` uses exact-after-round equality. Migrating to integer minor units behind a `Money` value object is Phase 1. Itemized splitting raises the stakes here: it performs dozens of divisions per bill where the other strategies perform one. It contains the risk locally by working in integer paise, which is an argument for doing the same everywhere rather than a substitute for it.
- **The forecast double-counts recurring expenses approximately.** Generated occurrences carry no reference to the rule that produced them, so the projection subtracts each rule's rate from the discretionary rate instead of excluding the occurrences by id. Exact over a long window, approximate over a short one; fixed properly by backlog item F8. Detailed in `docs/insights-pipelines.md`.
- **Percentage splits have no explicit remainder rule.** They reject inputs whose rounded shares miss the total instead of allocating the residual.
- **No test runner.** `npm run verify:calc` covers itemized split allocation and the forecast, but the rest of the money math is unverified by anything except manual QA.
- **No service layer.** Route handlers mix validation, business logic and persistence.
- **Missing endpoints.** Group expenses and settlements cannot be edited or deleted, and there is no member-removal or leave-group route.
- **Categories hard-delete.** Transactions and budgets referencing a deleted category are left with a dangling `categoryId` and render as "Uncategorized".
- **Invite codes use `Math.random()`**, not a cryptographic source.
- **`403` on inaccessible group and category ids** allows id enumeration.

---

## Data Modelling

Fee-Nance stores data as MongoDB documents with Mongoose schemas, modelled to map cleanly onto a normalised relational schema for the DBMS coursework.

### Collections

| Collection | Purpose |
|---|---|
| `users` | Account holder identity, preferences, OAuth linkage |
| `categories` | System-wide and user-defined income/expense categories |
| `transactions` | Individual income and expense entries with optional recurrence |
| `budgets` | Spending limits bound to a user, optional category, and date range |
| `groups` | Shared expense groups with member roles and invite codes |
| `groupexpenses` | Multi-payer group expense records with split breakdowns |
| `settlements` | Manual debt settlement entries between group members |

### Key relationships

- `transactions.userId` → `users._id`
- `transactions.categoryId` → `categories._id`
- `budgets.userId` → `users._id`
- `budgets.categoryId` → `categories._id` (optional)
- `groups.members[].userId` → `users._id`
- `groupexpenses.groupId` → `groups._id`
- `groupexpenses.paidBy[].userId` → `users._id`
- `groupexpenses.splits[].userId` → `users._id`
- `settlements.groupId` → `groups._id`
- `settlements.fromUserId` / `toUserId` → `users._id`

### Indexes

| Collection | Index | Serves |
|---|---|---|
| `users` | `email` unique, `googleId` | Login lookup, OAuth linking |
| `categories` | `{userId, name, type}` unique sparse, `isSystem` | Duplicate prevention, category list |
| `transactions` | `{userId, transactionDate}`, `{userId, type, transactionDate}`, `{userId, categoryId, transactionDate}` | Date-range list, summary aggregation, category breakdown |
| `budgets` | `{userId, cycle, periodStart}` | Active budget lookup per cycle |
| `groups` | `inviteCode` unique, `members.userId` | Join by code, "my groups" |
| `groupexpenses` | `{groupId, incurredAt}`, `createdBy`, `splitType` | Group expense timeline |
| `settlements` | `{groupId, settledAt}`, `{groupId, createdBy, idempotencyKey}` unique partial | Settlement history, duplicate suppression |

---

## Data Dictionary

### users
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | ✓ | Auto-generated primary key |
| `email` | String | ✓ | Unique, lowercase, indexed |
| `name` | String | ✓ | Display name |
| `passwordHash` | String | — | bcrypt hash; absent for OAuth-only accounts |
| `image` | String | — | Avatar URL |
| `googleId` | String | — | Linked Google OAuth ID |
| `preferences.currency` | String | — | Default `"INR"` |
| `preferences.dashboardDefaultRange` | String | — | `thisMonth` \| `last30Days` \| `thisYear` |
| `createdAt` / `updatedAt` | Date | ✓ | Mongoose timestamps |

### categories
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | ✓ | |
| `userId` | ObjectId | — | Null for system categories |
| `name` | String | ✓ | e.g. `"Salary"`, `"Food"` |
| `type` | String | ✓ | `"income"` \| `"expense"` |
| `icon` | String | — | Icon identifier |
| `color` | String | — | Hex colour |
| `isSystem` | Boolean | ✓ | True for built-in categories |

### transactions
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | ✓ | |
| `userId` | ObjectId | ✓ | FK → users |
| `type` | String | ✓ | `"income"` \| `"expense"` |
| `title` | String | ✓ | Short description |
| `notes` | String | — | Free-text notes |
| `amount` | Number | ✓ | Non-negative, in rupees (float — see Known limitations) |
| `currency` | String | ✓ | `"INR"` |
| `categoryId` | ObjectId | — | FK → categories |
| `transactionDate` | Date | ✓ | When the transaction occurred |
| `recurring.enabled` | Boolean | ✓ | Whether recurrence is active |
| `recurring.frequency` | String | — | `"monthly"` \| `"yearly"` |
| `recurring.nextRunAt` | Date | — | Next scheduled occurrence; read by the recurring runner |

### budgets
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | ✓ | |
| `userId` | ObjectId | ✓ | FK → users |
| `name` | String | ✓ | Budget label |
| `amount` | Number | ✓ | Spending limit |
| `currency` | String | ✓ | `"INR"` |
| `cycle` | String | ✓ | `"monthly"` \| `"quarterly"` \| `"yearly"` |
| `categoryId` | ObjectId | — | FK → categories (scoped budget) |
| `periodStart` | Date | ✓ | Budget window start |
| `periodEnd` | Date | ✓ | Budget window end |

### groups
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | ✓ | |
| `name` | String | ✓ | Group display name |
| `createdBy` | ObjectId | ✓ | FK → users |
| `inviteCode` | String | ✓ | Unique 8-char join code |
| `members[].userId` | ObjectId | ✓ | FK → users |
| `members[].role` | String | ✓ | `"owner"` \| `"member"` |
| `members[].joinedAt` | Date | ✓ | Membership timestamp |

### groupexpenses
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | ✓ | |
| `groupId` | ObjectId | ✓ | FK → groups |
| `createdBy` | ObjectId | ✓ | FK → users |
| `title` | String | ✓ | Expense description |
| `notes` | String | — | Optional detail |
| `amount` | Number | ✓ | Total expense amount |
| `currency` | String | ✓ | `"INR"` |
| `splitType` | String | ✓ | `"equal"` \| `"custom"` \| `"percentage"` \| `"itemized"` |
| `paidBy[].userId` | ObjectId | ✓ | Who paid |
| `paidBy[].amount` | Number | ✓ | How much they paid |
| `splits[].userId` | ObjectId | ✓ | Each member's share |
| `splits[].amount` | Number | — | Raw input for custom splits; provenance only |
| `splits[].percentage` | Number | — | Raw input for percentage splits; provenance only |
| `splits[].shareAmount` | Number | ✓ | Computed owed amount — the source of truth |
| `lineItems[].label` | String | — | Itemized splits only; one line of the bill |
| `lineItems[].amount` | Number | — | Price of that line |
| `lineItems[].sharedBy` | ObjectId[] | — | Members who shared that line |
| `lineItems[].proportional` | Boolean | — | Tax/tip: spread by subtotal, not evenly |
| `extraction.source` | String | — | Which OCR extractor produced the line items |
| `extraction.confidence` | Number | — | Extractor-reported confidence, if any |
| `extraction.extractedAt` | Date | — | When extraction ran |
| `incurredAt` | Date | ✓ | When the expense occurred |

`lineItems` is provenance, exactly like `splits[].amount` and `splits[].percentage` — `splits[].shareAmount` remains the only field balances are computed from.

### settlements
| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | ✓ | |
| `groupId` | ObjectId | ✓ | FK → groups |
| `fromUserId` | ObjectId | ✓ | Payer, FK → users |
| `toUserId` | ObjectId | ✓ | Receiver, FK → users |
| `amount` | Number | ✓ | Amount settled |
| `currency` | String | ✓ | `"INR"` |
| `note` | String | — | Optional note |
| `settledAt` | Date | ✓ | Settlement timestamp |
| `createdBy` | ObjectId | ✓ | FK → users |
| `idempotencyKey` | String | — | Optional; unique per `(groupId, createdBy)` when present |

---

## Relational Database Design

The SQL equivalents below show how the document model maps to a normalised relational schema. Full DDL, DML and query scripts are in `sql-scripts/` — they are documentation artifacts, not runtime migrations.

### Equivalent relational schema (normalised to 3NF)

```sql
-- Core identity
Users          (user_id PK, email UNIQUE, name, password_hash, image, google_id, currency, dashboard_range, created_at, updated_at)

-- Reference data
Categories     (category_id PK, user_id FK NULLABLE, name, type, icon, color, is_system)

-- Personal finance
Transactions   (transaction_id PK, user_id FK, type, title, notes, amount, currency, category_id FK NULLABLE,
                transaction_date, recurring_enabled, recurring_frequency, recurring_next_run)
Budgets        (budget_id PK, user_id FK, name, amount, currency, cycle, category_id FK NULLABLE, period_start, period_end)

-- Group finance
Groups         (group_id PK, name, created_by FK, invite_code UNIQUE)
GroupMembers   (group_id FK, user_id FK, role, joined_at)         -- junction table
GroupExpenses  (expense_id PK, group_id FK, created_by FK, title, notes, amount, currency, split_type, incurred_at)
ExpensePaidBy  (expense_id FK, user_id FK, amount)                -- junction table
ExpenseSplits  (expense_id FK, user_id FK, share_amount, percentage NULLABLE)  -- junction table
Settlements    (settlement_id PK, group_id FK, from_user_id FK, to_user_id FK, amount, currency, note, settled_at, created_by FK)
```

### Normalisation notes

- **1NF** — All fields are atomic; repeating groups (`members`, `paidBy`, `splits`) are extracted into separate junction tables.
- **2NF** — Every non-key attribute in each table depends on the whole primary key; junction tables carry only relationship-specific attributes.
- **3NF** — No transitive dependencies; currency and user preferences are stored only on `Users`, not repeated across child tables.

### Referential integrity constraints

| Table | Foreign Key | References |
|---|---|---|
| `categories` | `user_id` | `users` (NULL = system category) |
| `transactions` | `user_id` | `users` |
| `transactions` | `category_id` | `categories` |
| `budgets` | `user_id` | `users` |
| `budgets` | `category_id` | `categories` |
| `groups` | `created_by` | `users` |
| `groupmembers` | `group_id`, `user_id` | `groups`, `users` |
| `groupexpenses` | `group_id`, `created_by` | `groups`, `users` |
| `expensepaidby` | `expense_id`, `user_id` | `groupexpenses`, `users` |
| `expensesplits` | `expense_id`, `user_id` | `groupexpenses`, `users` |
| `settlements` | `group_id`, `from_user_id`, `to_user_id`, `created_by` | `groups`, `users` |

MongoDB does not enforce these at the storage layer; they are upheld in application code, which is why the dangling-`categoryId` case listed under Known limitations is possible.

See `docs/relational-mapping.md` for the column-by-column comparison and `docs/er-diagram.md` for the ER diagram.

## DBMS Deliverables

- `sql-scripts/` — DDL, DML, joins, subqueries, GROUP BY / HAVING, trigger and procedure equivalents
- `docs/DBMS.md`
- `docs/dbms-query-mapping.md`
- `docs/mongo-relational-equivalents.md`
- `docs/viva-notes-mongodb-vs-relational.md`
- `docs/dbms-report-output.json` — regenerate with `npm run dbms:report`
