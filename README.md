#Fee-Nance

Fee-Nance is an advanced personal finance and group expense management web app focused on financial clarity, strong data integrity, and practical real-world workflows.

## Runtime Direction
- Runtime database: MongoDB with Mongoose
- DBMS deliverables: SQL scripts folder for documentation mapping
- Authentication: Email/password + Google OAuth
- Currency: INR
- Budget cycles: Monthly, quarterly, yearly
- Recurring transactions: Monthly and yearly
- Group splits: Equal, custom, percentage
- Settlements: Manual with simplified pairwise balances

## Tech Stack
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- NextAuth
- MongoDB Atlas + Mongoose
- Zod

## Features

### Personal finance
- Category management (system + custom)
- Transaction create/list with date filtering
- Budget create/list with cycle support
- Income/expense summary and balance calculation

### Analytics
- Financial flow Sankey diagram (gross income → expenses/savings breakdown)
- Monthly trajectory chart (line and grouped-bar modes)
- Expenditure composition donut chart with category breakdown
- Quarterly overview bar chart with savings annotations
- Efficiency report: savings rate, expense ratio, deduction rate, overall rating
- KPI cards: gross income, deductions, net income, expenses, net savings
- Configurable date range with preset shortcuts (week / month / quarter / YTD / year / custom)

### Group expense management
- Group creation with invite code
- Join group via invite code
- Multi-payer group expense recording
- Equal, custom amount, and percentage splits with total-equality validation
- Balance computation per member
- Simplified pairwise settlement suggestions
- Manual settlement entries

### Group analytics
- Cross-group net balance Sankey (groups you owe vs groups that owe you)
- Per-group spend timeline with stacked member bars
- Member spend share donut
- Top expenses table
- Split type breakdown (equal / custom / percentage)
- Settlement flow Sankey with per-node proportional flow sizing
- Member net position bar chart

### Authentication and security
- NextAuth credentials login
- Google OAuth (enabled when credentials configured)
- Protected dashboard and private API routes

## Setup and Run

1. Install dependencies

```bash
npm install
```

2. Create local env file

```bash
cp .env.example .env
```

3. Fill required variables in `.env`
- `MONGODB_URI`
- `NEXTAUTH_URL` (usually `http://localhost:3000`)
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID` (optional)
- `GOOGLE_CLIENT_SECRET` (optional)

4. Seed realistic demo data

```bash
npm run seed
```

5. Run in development

```bash
npm run dev
```

6. Open app
- `http://localhost:3000`

## Scripts

- `npm run dev` - start development server
- `npm run build` - build for production
- `npm run start` - run production build
- `npm run lint` - lint codebase
- `npm run format` - auto-fix lint formatting issues
- `npm run seed` - seed realistic demo data
- `npm run dbms:report` - generate reproducible DBMS report output JSON

## Environment Variables

Required:
- `MONGODB_URI`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

Optional:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `LOG_LEVEL`

## Documentation Index (Phase 10)

Architecture and flow:
- `docs/architecture-module-flow.md`

ER and normalization:
- `docs/er-diagram.md`
- `docs/relational-mapping.md`

Private API reference:
- `docs/private-api-reference.md`

Demo walkthrough script:
- `docs/demo-script.md`

QA checklist:
- `docs/manual-qa-checklist.md`

## Demo Seed Data

Run:

```bash
npm run seed
```

Generate DBMS reproducible report output:

```bash
npm run dbms:report
```

Demo accounts (password `Demo@1234` for all):
- alex@feenance.demo
- riya@feenance.demo
- kabir@feenance.demo
- priya@feenance.demo
- arjun@feenance.demo
- nisha@feenance.demo
- dev@feenance.demo
- sneha@feenance.demo
- rahul@feenance.demo

## Data Modelling

Fee-Nance models financial data using MongoDB documents with Mongoose schemas, designed to mirror relational database concepts for DBMS study purposes.

### Collections and schema overview

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
| `amount` | Number | ✓ | Non-negative, in paise-equivalent INR |
| `currency` | String | ✓ | `"INR"` |
| `categoryId` | ObjectId | — | FK → categories |
| `transactionDate` | Date | ✓ | When the transaction occurred |
| `recurring.enabled` | Boolean | ✓ | Whether recurrence is active |
| `recurring.frequency` | String | — | `"monthly"` \| `"yearly"` |
| `recurring.nextRunAt` | Date | — | Next scheduled occurrence |

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
| `splitType` | String | ✓ | `"equal"` \| `"custom"` \| `"percentage"` |
| `paidBy[].userId` | ObjectId | ✓ | Who paid and how much |
| `paidBy[].amount` | Number | ✓ | |
| `splits[].userId` | ObjectId | ✓ | Each member's share |
| `splits[].shareAmount` | Number | ✓ | Computed owed amount |
| `splits[].percentage` | Number | — | Used for percentage splits |
| `incurredAt` | Date | ✓ | When the expense occurred |

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

---

## Relational Database Design

The SQL equivalents below show how the document model maps to a normalised relational schema. Full DDL, DML, and query scripts are in `sql-scripts/`.

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

See `docs/relational-mapping.md` for a detailed column-by-column comparison and `docs/er-diagram.md` for the ER diagram.

---

## DBMS Deliverables

- `sql-scripts/` (DDL, DML, joins, subqueries, GROUP BY, HAVING, logic-flow equivalents)
- `docs/dbms-query-mapping.md`
- `docs/mongo-relational-equivalents.md`
- `docs/viva-notes-mongodb-vs-relational.md`
- `docs/dbms-report-output.json` (generated via `npm run dbms:report`)

## Main Routes
- / landing page
- /login sign in
- /register sign up
- /dashboard protected dashboard

## Notes
- Private APIs are under /api/private and are not publicly documented.
- sql-scripts contains documentation-only relational mapping SQL, not runtime migrations.
- Follow `docs/secrets-policy.md` for environment and secret handling practices.
