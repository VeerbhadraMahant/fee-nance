> **Archived (MongoDB era, before October 2026).** This describes the design from when Fee-Nance ran on MongoDB. The runtime is now Supabase Postgres; the schema of record is `supabase/migrations/`, documented in [`docs/database.md`](../database.md). Kept as DBMS coursework history.

# Viva Notes: MongoDB vs Relational Mapping for Fee-Nance

## 1. Why MongoDB for Runtime

- Expense and split data naturally fit document structures (`paidBy[]`, `splits[]`, `members[]`).
- Frequent reads need whole aggregates (group expense + participants) without heavy joins.
- Flexible schema supports iterative MVP development while maintaining validation in backend.

## 2. How Relational Concepts Are Still Demonstrated

- DDL equivalent: in `sql-scripts/01-ddl-schema.sql`
- DML equivalent: in `sql-scripts/02-dml-demo-data.sql`
- JOIN and subquery equivalents: in `sql-scripts/03-joins-subqueries.sql`
- GROUP BY/HAVING equivalents: in `sql-scripts/04-groupby-having.sql`
- Procedure/function/trigger/cursor equivalents: in `sql-scripts/05-trigger-procedure-function-cursor-equivalents.sql` and backend docs

## 3. Key Mapping Examples to Explain Verbally

1. SQL JOIN -> Mongo `$lookup`
   - Example: group members with user profile details
2. SQL GROUP BY -> Mongo `$group`
   - Example: monthly income/expense trend
3. SQL HAVING -> Mongo `$match` after `$group`
   - Example: users/categories above spend threshold
4. SQL subquery -> nested aggregate stages / multi-stage reduction
   - Example: above-average spenders in current month

## 4. Integrity and Business Rule Enforcement

- Strict split and payer totals are enforced in `src/lib/split.ts`.
- API schema validation is enforced using Zod DTOs.
- Idempotency for settlements uses a unique partial index + key.

## 5. Reproducible Evidence for Viva

Run in sequence:

```bash
npm run seed
npm run dbms:report
```

Show these artifacts:
- `docs/dbms-report-output.json`
- `docs/dbms-query-mapping.md`
- `docs/mongo-relational-equivalents.md`
- `sql-scripts/` folder

## 6. Expected Viva Questions and Suggested Answers

Q: "Where are joins in MongoDB?"
A: Through aggregation pipelines with `$lookup`, plus embedded design for hot read paths.

Q: "Where are triggers/procedures?"
A: Replaced by backend service workflows and route-level orchestration with validation and idempotency.

Q: "How do you prove advanced query support?"
A: `npm run dbms:report` generates reproducible outputs for join-like, subquery-like, and GROUP BY/HAVING reports.
