> **Archived (MongoDB era, before October 2026).** This describes the design from when Fee-Nance ran on MongoDB. The runtime is now Supabase Postgres; the schema of record is `supabase/migrations/`, documented in [`docs/database.md`](../database.md). Kept as DBMS coursework history.


# Fee-Nance — DBMS Documentation

---

## 1. Data Modeling & Schema Design

Fee-Nance has 7 core entities: **User**, **Category**, **Transaction**, **Budget**, **Group**, **GroupMember**, and **GroupExpense/Settlement**. The data model is designed for document storage in MongoDB, but maps cleanly to a normalized relational schema.

**References:**
- `docs/er-diagram.md` — entities, primary keys, foreign keys, relationships
- `docs/relational-mapping.md` — each collection mapped to a relational table with proper column types and constraints

**Key design decisions:**
- Recurring transaction config is flattened into the Transaction table (no separate table) because it has no independent lifecycle — always read/written with the parent.
- GroupMember is a separate join entity capturing the many-to-many between Group and User, with an added `role` field.
- Categories support both system-level (shared) and user-level (custom) records via a nullable `userId` FK.
- Schema satisfies **3NF**: no partial dependencies, no transitive dependencies.

---

## 2. DDL & DML

To satisfy the relational DBMS deliverable, SQL scripts mirror every concept. These are documentation-only — the runtime database is MongoDB.

- `sql-scripts/01-ddl-schema.sql` — CREATE TABLE statements with PKs, FKs, CHECK constraints, ENUM types, UNIQUE constraints
  - Example: `(user_id, name, type)` unique constraint on Categories prevents duplicate custom category names per user per type
- `sql-scripts/02-dml-demo-data.sql` — sample INSERT statements for demo scenarios
  - MongoDB runtime equivalent: `src/scripts/seed.ts`

---

## 3. Joins & Subqueries

SQL joins and subqueries have direct equivalents in MongoDB's aggregation pipeline.

**References:** `sql-scripts/03-joins-subqueries.sql` and `src/lib/dbms-reporting.ts`

| SQL Concept | MongoDB Equivalent | Location |
|---|---|---|
| JOIN: group + members + users | `$unwind` + `$lookup` pipeline | `getJoinLikeGroupMembershipRows` |
| JOIN: expense + payers + splits | Nested arrays + pipeline joins | `dbms-reporting.ts` |
| Subquery: expense > monthly average | Multi-stage aggregate — compute average, then `$match` above it | `getAboveAverageSpendersInCurrentMonth` |
| Correlated subquery: top expense per user | `$group` + post-group filter | dashboard summary route |

---

## 4. GROUP BY & HAVING

GROUP BY and HAVING are used heavily for analytics — the dashboard and reporting APIs run these aggregations on every load.

**References:** `sql-scripts/04-groupby-having.sql` and `src/app/api/private/dashboard/summary/route.ts`

| SQL Concept | MongoDB Equivalent | Location |
|---|---|---|
| GROUP BY category | `Transaction.aggregate` grouped by `categoryId` | dashboard summary API |
| GROUP BY monthly trend | Aggregate by year/month with conditional income/expense sums | dashboard summary API |
| HAVING monthly spend threshold | `$group` then `$match` on grouped total | `getCategoryExpenseHavingRows` |
| HAVING settlement threshold | Settlement aggregate + threshold filter | `getSettlementHavingRows` |

---

## 5. Stored Procedures, Triggers, Functions & Cursors

Relational databases use stored objects for logic close to the data. In MongoDB with a backend service layer, these responsibilities move to TypeScript service modules.

**Reference:** `sql-scripts/05-trigger-procedure-function-cursor-equivalents.sql`

| Relational Concept | Backend Equivalent | Location |
|---|---|---|
| **Function** — deterministic computation | `validatePayers`, `computeShares`, `computePairwiseBalances` | `src/lib/split.ts` |
| **Stored Procedure** — multi-step orchestrated write | Settlement endpoint with idempotency + authorization | `settlements/route.ts` |
| **Trigger** — react to inserts/updates, maintain derived state | On-demand derived state computed at request time (balances, dashboard) | `balances/route.ts`, `summary/route.ts` |
| **Cursor** — row-by-row iterative processing | Iterative debtor-creditor loop (`simplifyPairwise`) | `balances/route.ts` |

---

## 6. Indexes & Data Integrity

Indexes are defined on all high-frequency query fields. Integrity is enforced at both the schema and service layer.

**Indexes in use:**
- `email` — unique index (login lookup)
- `googleId` — sparse index (OAuth login)
- `inviteCode` — unique index on Group (join via code)
- `userId + transactionDate` — compound index for date-range queries
- Settlement idempotency key — partial unique index to prevent duplicate settlements

**Integrity mechanisms:**
- Zod DTOs validate all API inputs at the boundary
- `src/lib/split.ts` enforces that payer totals and split shares must equal the expense total before any DB write

---

## 7. Reproducible DBMS Report

All aggregation pipelines have reproducible output captured in a report. Run the following command to regenerate it:

```bash
npm run dbms:report
```

Output: `docs/dbms-report-output.json`

The report contains:
- Join-like group membership rows
- Above-average spenders in current month (subquery equivalent)
- GROUP BY + HAVING category expense report
- GROUP BY + HAVING settlement totals report


