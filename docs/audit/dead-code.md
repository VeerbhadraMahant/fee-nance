> **Historical snapshot (September 2026, MongoDB codebase).** Phase 0 audit findings from before the move to Supabase. Many file paths and defects listed here no longer exist. The current assessment is [`docs/assessment-2026-11.md`](../assessment-2026-11.md).

# A6 — Dead Code & Unimplemented-Feature Inventory

_Phase 0 audit. Read-only._

## Confirmed dead code

| Symbol | File:line | Evidence |
|---|---|---|
| `approxEqual()` | `lib/money.ts:11-13` | Defined, **exported, never called** anywhere in `src/` (grep: only the definition matches). |
| `computePairwiseBalances()` | `lib/split.ts:131-184` | **Never imported.** The live balances route reimplements the same greedy match as `simplifyPairwise` (`balances/route.ts:12`). Only other references are in `docs/`. |
| `PairwiseBalance` interface | `lib/split.ts:21-25` | Used only by the dead `computePairwiseBalances`. |

## NOT dead — the backlog's starting assumption is wrong

**`recurring.nextRunAt` is actively used.** The backlog (A6) says "start with `recurring.nextRunAt`" as a dead field. It is not:
- Written on create (`transactions/route.ts:179-181`) and update (`[transactionId]/route.ts:73-75`), and in seed data.
- **Read and advanced** by `POST /transactions/recurring/run` (`recurring/run/route.ts:31,39,55`), which queries `recurring.nextRunAt: { $lte: now }`, clones the transaction, and rolls `nextRunAt` forward via `getNextDate`.

So the recurring field is a live (if minimal) feature, not dead schema. Reporting this rather than "fixing" a non-defect.

## Partially-wired / thin features

| Field / feature | Status |
|---|---|
| `splits[].amount`, `splits[].percentage` (`GroupExpense`) | Stored for provenance (`expenses/route.ts:208-209`) but never read back for computation — `shareAmount` is the source of truth. Informational, not strictly dead. |
| `Settlement.idempotencyKey` | Live (opt-in). See A5. |
| `User.googleId` / Google provider | Live only if `GOOGLE_CLIENT_ID/SECRET` are set (`auth.ts:51-58`); otherwise the provider is omitted at runtime. |
| `Category` soft-delete | **Does not exist** — `categories/[id]` DELETE is a hard `deleteOne` (`categories/[categoryId]/route.ts:118`). Transactions/budgets referencing the category are left with a dangling `categoryId` (they render as "Uncategorized"). This is the Phase 3 I1 target. |

## Documented-but-unimplemented features

Cross-referencing `README.md` / `docs/` claims against routes:

1. **Member removal / leaving a group** — no endpoint exists (`groups/[groupId]` has GET only). So Phase 3 **I2 (guard member removal) has nothing to guard yet**; the feature must be *built* before it can be protected.
2. **Editing / deleting a group expense** — no PATCH/DELETE on `groups/[groupId]/expenses`. Amendment trail (F2) starts from zero.
3. **Editing / deleting a settlement** — no PATCH/DELETE. Settlement handshake (F4) starts from zero.
4. **Settlement "suggestions" consumption** — the balances route returns `pairwiseSettlements` suggestions, but recording a settlement does not reference/consume a suggestion (relevant to I3 alt-approach and F4).
5. **Sankey layout** (`docs/audit` note) — implemented in group analytics components but undocumented (Phase 7 D4).

## Recommended immediate deletions (when Phase 1 opens)

- Remove `approxEqual` (or fold into the future `Money` value object).
- Remove `computePairwiseBalances` + `PairwiseBalance`, or make `balances/route.ts` consume the shared function instead of its local copy. Do **one** of these, not both silently.

_No deletions performed in Phase 0._
