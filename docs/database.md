# Database

Fee-Nance runs on Supabase Postgres. The schema of record is `supabase/migrations/`, applied in filename order. This page describes what those files create; if the two disagree, the migrations are right.

`npm run verify:db` applies every migration to an embedded Postgres (PGlite) and checks the row-level security policies, each SQL function and the group invariants. It needs no Supabase project.

## Entity-relationship diagram

```mermaid
erDiagram
  AUTH_USERS ||--|| PROFILES : "trigger creates"
  PROFILES ||--o{ CATEGORIES : owns
  PROFILES ||--o{ TRANSACTIONS : owns
  PROFILES ||--o{ BUDGETS : owns
  PROFILES ||--o{ GOALS : owns
  CATEGORIES |o--o{ TRANSACTIONS : classifies
  CATEGORIES |o--o{ BUDGETS : scopes
  PROFILES ||--o{ GROUPS : creates
  GROUPS ||--|{ GROUP_MEMBERS : has
  PROFILES ||--o{ GROUP_MEMBERS : "belongs via"
  GROUPS ||--o{ GROUP_EXPENSES : records
  GROUP_EXPENSES ||--|{ GROUP_EXPENSE_PAYERS : "paid by"
  GROUP_EXPENSES ||--|{ GROUP_EXPENSE_SPLITS : "split into"
  GROUPS ||--o{ SETTLEMENTS : records

  PROFILES {
    uuid id PK "= auth.users.id"
    text email
    text name
    text avatar_url
    text currency "INR only"
    text dashboard_default_range
  }
  CATEGORIES {
    uuid id PK
    uuid user_id FK "null = system category"
    text name
    text type "income | expense"
    bool is_system
  }
  TRANSACTIONS {
    uuid id PK
    uuid user_id FK
    text type "income | expense"
    text title
    numeric amount "15,2 and > 0"
    uuid category_id FK "on delete set null"
    timestamptz transaction_date
    bool recurring_enabled
    text recurring_frequency "monthly | yearly"
    timestamptz recurring_next_run_at
  }
  BUDGETS {
    uuid id PK
    uuid user_id FK
    numeric amount
    text cycle "monthly | quarterly | yearly"
    uuid category_id FK "null = all spending"
    timestamptz period_start
    timestamptz period_end
  }
  GOALS {
    uuid id PK
    uuid user_id FK
    text theme
    numeric target_amount
    numeric saved_amount
    timestamptz target_date
  }
  GROUPS {
    uuid id PK
    text name
    uuid created_by FK
    text invite_code UK
  }
  GROUP_MEMBERS {
    uuid group_id PK
    uuid user_id PK
    text role "owner | member"
  }
  GROUP_EXPENSES {
    uuid id PK
    uuid group_id FK
    uuid created_by FK
    numeric amount
    text split_type "equal | custom | percentage | itemized"
    jsonb line_items "itemized provenance"
    timestamptz incurred_at
  }
  GROUP_EXPENSE_PAYERS {
    uuid expense_id PK
    uuid user_id PK
    numeric amount
  }
  GROUP_EXPENSE_SPLITS {
    uuid expense_id PK
    uuid user_id PK
    numeric share_amount "the amount that counts"
  }
  SETTLEMENTS {
    uuid id PK
    uuid group_id FK
    uuid from_user_id FK
    uuid to_user_id FK
    numeric amount
    text idempotency_key "unique per group and creator"
  }
```

## Tables

| Table | Holds | Key constraints |
|---|---|---|
| `profiles` | One row per auth user: name, email, avatar, preferences | PK is `auth.users.id`; created by the `on_auth_user_created` trigger. Users may update only `name`, `currency` and `dashboard_default_range` (column grants) |
| `categories` | Seven shared system categories plus each user's own | Unique `(user_id, name, type)` with `NULLS NOT DISTINCT`; `is_system = (user_id is null)` |
| `transactions` | Personal income and expenses; a row with `recurring_enabled` is also a recurring rule | `amount > 0`; deleting a category leaves its transactions uncategorised |
| `budgets` | A spending limit over a period, optionally for one category | `period_end > period_start` |
| `goals` | Savings targets and progress | `target_amount > 0`, `saved_amount >= 0` |
| `groups`, `group_members` | Shared ledgers and their members | PK `(group_id, user_id)`; one owner per group |
| `group_expenses` | A shared bill | Cascades from `groups`; `line_items` records how an itemized split was derived |
| `group_expense_payers`, `group_expense_splits` | Who paid and who owes what, per expense | PK `(expense_id, user_id)`; sums checked by `create_group_expense` |
| `settlements` | Repayments between two members | `from_user_id <> to_user_id`; unique `(group_id, created_by, idempotency_key)` |

Money is `numeric(15,2)`, so storage is exact. Application arithmetic still uses JavaScript numbers rounded with `roundCurrency`, except itemized allocation, which works in integer paise.

## Row-level security

Every table has RLS enabled. API routes query Supabase with the signed-in user's JWT, so the policies below decide what any request can read or write.

| Table | Read | Write |
|---|---|---|
| `profiles` | Yourself, and anyone you share a group with | Yourself, limited columns |
| `categories` | System categories and your own | Your own, never system ones |
| `transactions`, `budgets`, `goals` | Owner only | Owner only |
| `groups`, `group_members`, `group_expenses`, payers, splits | Members of the group | Only through the SQL functions below |
| `settlements` | Members of the group | A member may insert one between two members |

Membership is checked by `is_group_member()` and `shares_group_with()`, both `SECURITY DEFINER`, so a policy on `group_members` can ask about membership without recursing into its own policy.

## Functions

Read functions are `SECURITY INVOKER`: they run as the caller, RLS still applies, and they filter on `auth.uid()` explicitly so the planner can use the `(user_id, …)` indexes.

| Function | Purpose |
|---|---|
| `ledger_type_totals`, `ledger_balance_before` | Income and expense totals, and balance as of a date |
| `ledger_category_totals`, `ledger_monthly_totals`, `ledger_quarterly_totals`, `ledger_daily_net` | Breakdowns for the dashboard, analytics and report |
| `budget_spend(ids)` | Spend inside each budget's own period and category, in one query |
| `insights_outliers` | Each expense against the eleven before it in its category (z-score) |
| `insights_duplicates` | Same amount and title within 48 hours |
| `insights_drift` | Each category-month against its trailing three-month average |

Group writes are `SECURITY DEFINER` because they touch several tables atomically. Each checks the caller's membership itself first.

| Function | Purpose |
|---|---|
| `create_group(name)` | Creates the group and the owner's membership |
| `join_group(code)` | Joins by invite code; idempotent |
| `leave_or_delete_group(id)` | A member leaves; the owner deletes the group for everyone |
| `create_group_expense(...)` | Writes the expense, payers and splits in one transaction after checking membership and sums |
| `generate_invite_code()` | Eight characters from a 32-letter alphabet (uses `random()`, not a cryptographic source) |

Execute is revoked from `PUBLIC` on every function and granted to `authenticated` only; the trigger helpers are not callable.

## Indexes

| Index | Serves |
|---|---|
| `transactions (user_id, transaction_date desc)` | Ledger lists and every date-bounded total |
| `transactions (user_id, type, transaction_date desc)` | Income/expense totals and insights |
| `transactions (user_id, category_id, transaction_date desc)` | Category breakdowns and budget spend |
| `transactions (user_id, recurring_next_run_at) where recurring_enabled` | Finding due recurring rules |
| `budgets (user_id, period_start desc)` | Budget lists |
| `goals (user_id, created_at desc)` | Goal lists |
| `group_members (user_id)` | "My groups" and membership checks |
| `group_expenses (group_id, incurred_at desc)` | Group ledgers and balances |
| `settlements (group_id, settled_at desc)` | Settlement history and balances |

## Invariants

These hold for every group and are checked at write time by `create_group_expense` and across existing data by `GET /api/private/diagnostics`:

- The splits of an expense sum to its amount.
- The payments of an expense sum to its amount.
- Every payer and every participant is a member of the group when the expense is written.
- Net balances across a group's members sum to zero.
