> **Historical snapshot (September 2026, MongoDB codebase).** Phase 0 audit findings from before the move to Supabase. Many file paths and defects listed here no longer exist. The current assessment is [`docs/assessment-2026-11.md`](../assessment-2026-11.md).

# A2 — Money Path Trace

_Phase 0 audit. Read-only._

## Representation (confirmed)

Every monetary field is a **`Number` in whole/decimal rupees** — there is no paise/minor-unit encoding, and no `Decimal128`.

| Field | Schema type | Unit | File:line |
|---|---|---|---|
| `Transaction.amount` | `Number, min:0` | rupees | `models/Transaction.ts:47` |
| `Budget.amount` | `Number, min:0` | rupees | `models/Budget.ts:16` |
| `GroupExpense.amount` | `Number, min:0` | rupees | `models/GroupExpense.ts:70` |
| `GroupExpense.paidBy[].amount` | `Number, min:0` | rupees | `models/GroupExpense.ts:10` |
| `GroupExpense.splits[].amount` | `Number` (optional) | rupees | `models/GroupExpense.ts:28` |
| `GroupExpense.splits[].shareAmount` | `Number, min:0` | rupees | `models/GroupExpense.ts:36` |
| `Settlement.amount` | `Number, min:0` | rupees | `models/Settlement.ts:23` |

Seed data uses whole rupees (e.g. `amount: 85000`). But nothing enforces integer-ness: Zod validators are `z.number().positive()` (`transactions/route.ts:14`, `groups/[groupId]/expenses/route.ts:15`, etc.), which accept arbitrary floats. Custom/percentage splits can therefore produce fractional-rupee `shareAmount`s.

## The rounding helper

`lib/money.ts`:
- `roundCurrency(x) = Math.round((x + EPSILON) * 100) / 100` — rounds a float to 2 dp (line 1-3).
- `assertPositiveAmount` — finite & `> 0` (line 5-9).
- `approxEqual(a,b,ε=0.01)` — tolerance compare (line 11-13). **Never called anywhere** (see A6).

## Where money is read / written / summed / divided / compared

**Written (create/update):**
- `transactions/route.ts:171` and `[transactionId]/route.ts:60` — `amount` stored verbatim from payload.
- `budgets/route.ts:77`, `budgets/[budgetId]/route.ts:50` — verbatim.
- `groups/[groupId]/expenses/route.ts:196-211` — `amount`, `paidBy[].amount`, `splits[].shareAmount` written; `shareAmount` comes from `computeShares`.
- `groups/[groupId]/settlements/route.ts:213` — verbatim.

**Divided (allocation):**
- `split.ts:77` — equal split `totalAmount / memberIds.length`, then `roundCurrency`.
- `split.ts:114` — percentage `totalAmount * pct / 100`, then `roundCurrency`.

**Summed / compared server-side:**
- `split.ts:27-31` `assertTotals` — compares `roundCurrency(total) !== roundCurrency(computed)`. This is **exact equality after rounding to 2 dp**, not epsilon tolerance — so it is stricter than the backlog assumed, but it still operates on floats.
- `split.ts:52-59` payer sum; `:106` custom sum; `:117-119` percentage sum; `:125` amount sum.
- `groups/[groupId]/balances/route.ts:80-100` — folds every expense split/payment and settlement into an in-memory `Map<string,number>`, `roundCurrency` after each step. `simplifyPairwise` (`:12-52`) uses `> 0.01` / `<= 0.01` **float tolerance** thresholds.
- `groups/[groupId]/analytics/route.ts` and `groups/analytics/route.ts` — repeated in-memory `sum + e.amount`, `roundCurrency`, and `> 0.5` threshold (`groups/analytics/route.ts:118`).
- `transactions/route.ts:104-126`, `dashboard/summary/route.ts:33-79`, `analytics/summary/route.ts:51-102` — MongoDB `$sum`/`$cond` aggregation on `$amount` (integer-safe in the DB, but results are floats client-side).

**Formatted (display):** `roundCurrency` and `toLocaleString`/currency formatting appear in **server responses AND UI components** — e.g. analytics routes call `roundCurrency` before returning JSON (`groups/[groupId]/analytics/route.ts:92-197`), and components (`finance-manager.tsx`, `dashboard-overview.tsx`, `analytics-suite.tsx`, `group-detail*.tsx`) format again. Formatting is thus split across layers (relevant to M4).

## Inconsistencies found

1. **Float money throughout.** All arithmetic is IEEE-754 float on rupee values; correctness rests entirely on `roundCurrency` being called after every operation. Any missed call accumulates error. (M1/M2/M3.)
2. **No integer/paise invariant.** Payloads accept fractional rupees; `shareAmount` from percentage splits is routinely fractional (e.g. seed "Road Trip Fuel" 4200 × 30% = 1260 is clean, but arbitrary inputs need not be). (M1/M5.)
3. **Two different comparison philosophies coexist.** `split.ts` uses exact-after-round equality (`assertTotals`); `balances`/`analytics` routes use epsilon thresholds (`0.01`, `0.5`). (M6.)
4. **Remainder handling differs by path.** Equal split pushes the entire remainder onto the *last member* (`split.ts:80-85`); percentage split does **not** reconcile any residual to the total at all — it only asserts the rounded sum equals the total and throws if it doesn't (`split.ts:125-126`), which can reject otherwise-valid inputs. (M5 — see A4.)
5. **`simplifyPairwise` is duplicated** and diverges from `split.ts:computePairwiseBalances` (which is unused). (See A5/A6.)

**Conclusion:** the monetary-correctness concern in Phase 1 is real. Money is float rupees; there is no `Money` value object; remainder rules are inconsistent and one path (percentage) has no explicit remainder allocation.
