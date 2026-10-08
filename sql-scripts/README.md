# SQL Scripts (Documentation-Only)

These SQL files are for DBMS academic mapping only.

> **Runtime database is now Supabase Postgres.** The live schema, row-level security and SQL functions are in `../supabase/migrations/`. These scripts predate that move: they were written to mirror the earlier MongoDB design in relational form for the course deliverables, and are kept as-is.

## Files
- `01-ddl-schema.sql`: relational DDL equivalent of Mongo collections
- `02-dml-demo-data.sql`: sample DML inserts for demo scenarios
- `03-joins-subqueries.sql`: join and subquery examples mapped from aggregation behavior
- `04-groupby-having.sql`: GROUP BY and HAVING reporting queries
- `05-trigger-procedure-function-cursor-equivalents.sql`: relational equivalents for backend logic patterns

## Notes
- The scripts intentionally use standard SQL patterns for readability during viva.
- They are not executed by this project.
- MongoDB runtime equivalents are documented in `docs/dbms-query-mapping.md`.
