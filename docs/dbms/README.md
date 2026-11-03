# DBMS coursework archive (MongoDB era)

These files were written for the DBMS mini-project, when Fee-Nance ran on MongoDB with Mongoose. They map the document model to a relational design and show SQL equivalents of the aggregation pipelines.

The app has since moved to Supabase Postgres, so the relational design is now the real one. For the current schema, row-level security and SQL functions, see [`../database.md`](../database.md) and `supabase/migrations/`.

| File | Contents |
|---|---|
| `DBMS.md` | Consolidated DBMS write-up |
| `er-diagram.md` | ER diagram of the MongoDB-era model |
| `relational-mapping.md` | Relational mapping and normalisation to 3NF |
| `dbms-query-mapping.md` | SQL concepts mapped to MongoDB runtime code |
| `mongo-relational-equivalents.md` | Trigger, procedure, function and cursor equivalents |
| `viva-notes-mongodb-vs-relational.md` | Viva preparation notes |
| `insights-pipelines.md` | The `$setWindowFields` pipelines, now ported to the `insights_*` SQL functions |
| `dbms-report-output.json` | Output of the former `npm run dbms:report` (the script no longer exists) |
| `sql-scripts/` | Documentation-only DDL, DML, joins, subqueries, GROUP BY and HAVING |
