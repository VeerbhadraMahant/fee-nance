> **Historical snapshot (September 2026, MongoDB codebase).** Phase 0 audit findings from before the move to Supabase. Many file paths and defects listed here no longer exist. The current assessment is [`docs/assessment-2026-11.md`](../assessment-2026-11.md).

# A5 — Balance & Settlement Computation Trace

_Phase 0 audit. Read-only._

## Primary path: `GET /groups/[groupId]/balances` (`balances/route.ts`)

DB round-trips per request:
1. `Group.findById` (membership) — `:64`
2. `GroupExpense.find({groupId})` — **all** expenses, `.lean()` — `:78`
3. `Settlement.find({groupId})` — **all** settlements, `.lean()` — `:92`

→ **3 queries total, independent of member/expense count.** Not N+1. Aggregation is done in memory:

- Loop every expense, every split (`-shareAmount`) and every payer (`+amount`) into a `Map` (`:80-90`).
- Loop every settlement (`from += amount`, `to -= amount`) (`:94-100`).
- `simplifyPairwise(balances)` (`:12-52`) greedily matches debtors↔creditors.

**Assessment:** round-trip count is fine. The concern is that **all aggregation is in application memory** with per-step `roundCurrency`, using float tolerance thresholds (`> 0.01`, `<= 0.01`). For large groups this could be a MongoDB aggregation pipeline (`$unwind` splits/paidBy + `$group`), but correctness — not round-trips — is the real issue here. Low priority for perf; relevant to M-phase for float handling.

## `GET /groups/[groupId]/analytics` (`groups/[groupId]/analytics/route.ts`)

DB round-trips: `Group.findById` + `Promise.all([GroupExpense.find, Settlement.find, User.find])` = **4 queries**, all scoped by `groupId`/member ids. No N+1. Heavy in-memory folding (spendByMember, monthly timeline, top-10, split breakdown, settlement flow, net positions, share-of-spend) — all O(expenses+settlements), single pass-ish. Fine.

## `GET /groups/analytics` (cross-group overview)

Round-trips: `Group.find({members.userId})` + `GroupExpense.find({groupId:{$in}})` + `Settlement.find({groupId:{$in}})` = **3 queries** for *all* the user's groups. Then it `.filter()`s the in-memory arrays per group (`groups/analytics/route.ts:66-67`) — O(groups × expenses). Acceptable at demo scale; would benefit from a grouped pipeline at scale, but **no N+1** (it does not query per group).

## Personal aggregations

- `dashboard/summary` — 4 parallel `Transaction.aggregate` + 1 `Group.countDocuments` + 1 `Category.find` follow-up = 6 queries, all indexed by `userId`. Good use of the DB.
- `analytics/summary` — 5 parallel aggregations + 1 category lookup. Good.
- `transactions` GET — `countDocuments` + `find` + `aggregate` in parallel. Good.

These already push summation into MongoDB `$sum` — the "in-memory aggregation that belongs in a pipeline" criticism applies to the **group** balance/analytics routes, not the personal ones.

## Duplicated & divergent settlement logic

Two independent debtor/creditor matchers exist:
- `split.ts:computePairwiseBalances` (`:131-184`) — **never imported anywhere** (dead; see A6).
- `balances/route.ts:simplifyPairwise` (`:12-52`) — the one actually used.

They implement the same greedy algorithm with slightly different thresholds. The dead one should be removed or the live one should reuse it (Phase 5 R1/R2 consolidation).

## Settlement write path & idempotency (`settlements/route.ts` POST)

- Validates from≠to, both members, positive amount.
- **Idempotency is implemented**: optional `x-idempotency-key` / `idempotency-key` header (`:169-173`), pre-checked (`:197-207`), backed by a **unique partial index** `{groupId,createdBy,idempotencyKey}` (`models/Settlement.ts:63-69`), with duplicate-key catch that returns the existing record (`:235-252`).
- **Gap (I3):** idempotency only protects when the *client sends a key*. Without a key, two identical concurrent settlements both insert — there is no natural uniqueness on `{groupId,from,to,amount,settledAt}` and no "consume a suggestion" mechanism. Phase 3 I3 is partly done (opt-in), not fully.

## Findings

1. Balance/settlement computation is **not N+1** anywhere — a constant number of `groupId`/`userId`-scoped queries per request.
2. Group balance & analytics do **in-memory float folding** with tolerance thresholds; candidates for a pipeline and (more importantly) integer-paise migration.
3. `computePairwiseBalances` in `split.ts` is dead and divergent from the live `simplifyPairwise`.
4. Settlement idempotency exists but is **opt-in** (header-gated); unkeyed duplicates are still possible (I3).
5. **Existing indexes already cover A5/I6 needs:** `transactions{userId,transactionDate}`, `groupexpenses{groupId,incurredAt}`, `settlements{groupId,settledAt}` all exist. The Phase 3 I6 "missing indexes" task is largely **already satisfied** — verify rather than add.
