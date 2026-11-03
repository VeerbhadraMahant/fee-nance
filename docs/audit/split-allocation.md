> **Historical snapshot (September 2026, MongoDB codebase).** Phase 0 audit findings from before the move to Supabase. Many file paths and defects listed here no longer exist. The current assessment is [`docs/assessment-2026-11.md`](../assessment-2026-11.md).

# A4 — Split Allocation Trace

_Phase 0 audit. Read-only._

All split logic lives in `lib/split.ts`, called from `groups/[groupId]/expenses/route.ts:188`.

## The three split types (`computeShares`, `split.ts:62-129`)

### Equal (`:76-86`)
```ts
const perMember = roundCurrency(totalAmount / memberIds.length);
// each member gets perMember, EXCEPT the last member gets
// roundCurrency(totalAmount - runningSumOfPrevious)
```
- **Remainder handling:** the last member absorbs the entire rounding residual. Deterministic, and the parts always sum exactly to `totalAmount`. This is a *last-member* rule, **not** largest-remainder (M5 wants largest-remainder documented).
- **Distribution fairness:** for e.g. ₹100 / 3 → 33.33, 33.33, 33.34. Acceptable, but the last member always eats the residual (systematically ~1 paisa unfair to one fixed position).
- Splits over **all group members** (`memberIds`), ignoring any `splits[]` payload.

### Custom (`:100-110`)
```ts
shareAmount = roundCurrency(split.amount ?? 0)
assertTotals(totalAmount, sum(shareAmount), "Custom split")
```
- **No remainder allocation** — the client supplies exact amounts; the server only validates the sum matches. Reasonable.

### Percentage (`:112-128`)
```ts
shareAmount = roundCurrency(totalAmount * pct / 100)
if (roundCurrency(sum(pct)) !== 100) throw
assertTotals(totalAmount, sum(shareAmount), "Percentage split")
```
- **No remainder reconciliation.** Each share is rounded independently, then their sum is required to equal the total exactly (after rounding). When independent rounding does **not** reproduce the total, the write is **rejected** rather than corrected. Example: total ₹100, three members at 33.33% / 33.33% / 33.34% → 33.33 + 33.33 + 33.34 = 100.00 (ok), but total ₹0.10 with 3 equal-ish percentages, or totals where `amount*pct/100` rounds such that the residual ≠ 0, will throw `"Percentage split total must exactly match expense total"`. **This is the main correctness gap for M5** — percentage splits need explicit largest-remainder allocation so the parts are *forced* to sum to the total instead of being rejected.

## "Total equality" validation (`assertTotals`, `split.ts:27-31`)

```ts
if (roundCurrency(total) !== roundCurrency(computedTotal))
  throw new Error(`${fieldName} total must exactly match expense total`);
```
- Compares **exact equality after rounding both sides to 2 dp**. It is *not* an epsilon-tolerance compare (contrary to the Phase 1/M6 assumption). So M6's "replace float tolerance with exact equality" is **already satisfied inside `split.ts`**.
- BUT it operates on floats and rounds first, so two values differing by <0.005 compare equal. With true integer paise this ambiguity disappears (M1/M3).
- The same-total rule is applied to: payers (`validatePayers:59`), custom splits (`:107`), percentage amounts (`:126`).

## Payer validation (`validatePayers`, `:45-60`)
- Requires ≥1 payer, distinct users, each `amount > 0`, and `sum(payers) === total`.
- Membership of payers is checked in the **route** (`expenses/route.ts:181-185`), not in `split.ts`.

## Distinct-user checks (`assertDistinctUsers`, `:33-43`)
- Applied to payers and to custom/percentage splits. Equal split trusts `memberIds` (already unique).

## Findings

1. **Equal split is correct and total-preserving**, but uses a last-member remainder rule, undocumented (M5).
2. **Percentage split has no remainder allocation** — it validates-and-rejects instead of allocating. This is a genuine defect: legitimate percentage inputs can be rejected. (M5, primary fix.)
3. **Equality validation already uses exact (rounded) comparison**, not tolerance — M6 is partly pre-satisfied; the remaining work is moving off floats to integer paise so "rounded equality" becomes "true equality".
4. **Split membership rule is incomplete at write time:** `computeShares` checks `splits[].userId ∈ memberIds` (`:92-96`), and payers are checked in the route, but there is no check that members are *current at the expense date* (temporal membership is out of scope until Phase 6 F7). For Phase 3 I4, the present per-request membership check is adequate.
