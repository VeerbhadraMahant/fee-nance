> **Archived (MongoDB era, before October 2026).** This describes the design from when Fee-Nance ran on MongoDB. The runtime is now Supabase Postgres; the schema of record is `supabase/migrations/`, documented in [`docs/database.md`](../database.md). Kept as DBMS coursework history.

# DBMS Query Mapping (SQL Concept -> MongoDB Runtime)

This document maps relational SQL concepts from `sql-scripts/` to actual MongoDB runtime logic in the application.

## Mapping Table

| SQL Concept | SQL Reference | Mongo Runtime Equivalent | Location |
|---|---|---|---|
| DDL (schema) | `sql-scripts/01-ddl-schema.sql` | Mongoose schema definitions + indexes | `src/models/*.ts` |
| DML (seeded inserts) | `sql-scripts/02-dml-demo-data.sql` | Seed upserts/inserts | `src/scripts/seed.ts` |
| JOIN: group + members + users | `sql-scripts/03-joins-subqueries.sql` (Query 1) | `$unwind + $lookup` pipeline | `src/lib/dbms-reporting.ts` -> `getJoinLikeGroupMembershipRows` |
| JOIN: expense + payers + splits | `sql-scripts/03-joins-subqueries.sql` (Query 2) | Nested arrays + pipeline joins in reporting context | `src/lib/dbms-reporting.ts` |
| Subquery: expense > monthly average | `sql-scripts/03-joins-subqueries.sql` (Query 3) | Multi-stage aggregate with inner average and comparison | `src/lib/dbms-reporting.ts` -> `getAboveAverageSpendersInCurrentMonth` |
| Correlated subquery top expense/user | `sql-scripts/03-joins-subqueries.sql` (Query 4) | Grouping and post-group filtering via aggregate stages | `src/app/api/private/dashboard/summary/route.ts` and reporting service |
| GROUP BY category summary | `sql-scripts/04-groupby-having.sql` (Query 1) | `Transaction.aggregate` grouped by category | `src/app/api/private/dashboard/summary/route.ts` |
| GROUP BY monthly trend | `sql-scripts/04-groupby-having.sql` (Query 2) | Aggregate by year/month with conditional sums | `src/app/api/private/dashboard/summary/route.ts` |
| HAVING monthly spend threshold | `sql-scripts/04-groupby-having.sql` (Query 3) | `$group` then `$match` on aggregate value | `src/lib/dbms-reporting.ts` -> `getCategoryExpenseHavingRows` |
| HAVING settlement threshold | `sql-scripts/04-groupby-having.sql` (Query 4) | Settlement aggregate + threshold filter | `src/lib/dbms-reporting.ts` -> `getSettlementHavingRows` |

## Reproducible Reporting Output

Generate reproducible aggregation outputs:

```bash
npm run dbms:report
```

This produces:
- `docs/dbms-report-output.json`

The JSON captures report data for:
- Join-like membership rows
- Subquery-like above-average spenders
- GROUP BY + HAVING category expense report
- GROUP BY + HAVING settlement totals report

## Runtime/API References

- Dashboard aggregates: `src/app/api/private/dashboard/summary/route.ts`
- Finance aggregate workspace: `src/app/api/private/finance/aggregate/route.ts`
- Group balance computation: `src/app/api/private/groups/[groupId]/balances/route.ts`
- Split validation and share computation: `src/lib/split.ts`
