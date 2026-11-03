> **Archived (MongoDB era, before October 2026).** This describes the design from when Fee-Nance ran on MongoDB. The runtime is now Supabase Postgres; the schema of record is `supabase/migrations/`, documented in [`docs/database.md`](../database.md). Kept as DBMS coursework history.

# Trigger / Procedure / Function / Cursor Equivalents

This project uses MongoDB and backend TypeScript services instead of relational stored database objects.

## 1. Function Equivalents

Relational function intent:
- deterministic computation/validation close to data operations

Mongo/Backend equivalent:
- `validatePayers`, `computeShares`, and `computePairwiseBalances`
- Location: `src/lib/split.ts`

What they replace:
- SQL user-defined functions for split arithmetic and consistency checks

## 2. Procedure Equivalents

Relational stored procedure intent:
- orchestrate multi-step writes with validation and transactional semantics

Mongo/Backend equivalent:
- Group settlement endpoint logic with idempotency and authorization
- Location: `src/app/api/private/groups/[groupId]/settlements/route.ts`

What it replaces:
- `post_settlement(...)` style stored procedures

## 3. Trigger Equivalents

Relational trigger intent:
- react to inserts/updates and maintain derived state

Mongo/Backend equivalent:
- On-demand derivation using aggregate/read logic at request time
- Locations:
  - `src/app/api/private/dashboard/summary/route.ts`
  - `src/app/api/private/groups/[groupId]/balances/route.ts`

What it replaces:
- AFTER INSERT/UPDATE triggers on transaction/expense/settlement tables

## 4. Cursor Equivalents

Relational cursor intent:
- row-by-row procedural iteration for reconciliation or pairwise settlement logic

Mongo/Backend equivalent:
- Iterative balancing in memory via loops over aggregate results/maps
- Locations:
  - `simplifyPairwise` in `src/app/api/private/groups/[groupId]/balances/route.ts`
  - iterative reducers in dashboard and finance summaries

What it replaces:
- explicit SQL cursor blocks for debtor-creditor settlement

## 5. Why This Mapping Is Valid for DBMS Submission

- The same algorithmic responsibilities are preserved.
- Data integrity checks are enforced in service logic before persistence.
- Complex reporting is implemented by aggregation pipelines.
- Outputs are reproducible via `npm run dbms:report`.
