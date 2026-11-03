# Fee-Nance — Remediation & Build Backlog

## Context for the agent

Project: Fee-Nance — personal finance + group expense app.
Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Supabase (Postgres with RLS, Auth with Google), optional Upstash Redis, Zod 4. Written when the stack was NextAuth and MongoDB; item wording that mentions Mongoose, `ObjectId` or `Decimal128` predates the move.
Deployment: Vercel. Currency: INR only.

**Important:** the findings below were derived from the README, `package.json`, and `middleware.ts` only — `src/` was never inspected. Every task therefore begins with an audit step. Do not assume a defect exists. Confirm it in the code first, report what you found, and only then apply the fix. If an audit shows the problem is already handled, say so and move on.

## Status (November 2026)

Measured in [`docs/assessment-2026-11.md`](docs/assessment-2026-11.md); the working order is [`TODO.md`](TODO.md).

| Phase | Done | Open items |
|---|---|---|
| 0 Audit | ~100% | — (`docs/audit/`, MongoDB era) |
| 1 Monetary correctness | ~25% | M1–M5: Money value object, paise everywhere; M6 exact comparison in SQL |
| 2 Authorization | ~90% | S5: reject unknown keys |
| 3 Data integrity | ~60% | I1 category soft-delete (currently `on delete set null`), I2 leave-with-balance guard |
| 4 Tests | ~50% | T1 Vitest, T5 per-route authorization tests. T6 CI is done |
| 5 Architecture | ~15% | R1 service layer, R2 split strategies, R4 ADR, R5 metrics. R3 mappers exist |
| 6 Features | ~5% | All; F5, F8, F10, F13, F14 are prioritised in `TODO.md`, F1–F4 and F12 deferred |
| 7 Documentation | ~70% | D2 `docs/seml/`, D4 Sankey write-up. D1, D3, D5 done |

Work top to bottom. Do not start a phase until the previous one is green.

---

## Phase 0 — Audit (do this first, change nothing)

**A1. Map the codebase.** Produce a tree of `src/`, list every API route under `/api`, every Mongoose model, every service/helper module, and every page. Output as a single markdown report at `docs/audit/codebase-map.md`.

**A2. Trace the money path.** Find every place an amount is read, written, summed, divided, or compared. Record the declared type in the schema, whether values are rupees or paise, and any rounding. Report inconsistencies.

**A3. Trace authorization.** For every route under `/api/private`, record whether the handler independently verifies that the session user owns the resource or belongs to the group before reading or writing. Produce a table: route, method, resource, ownership check present (yes/no), line reference.

**A4. Trace split allocation.** Locate the equal/custom/percentage split logic. Record how remainders are handled and how the "total equality" validation compares sums.

**A5. Trace balance and settlement computation.** Record the query pattern — count DB round-trips per member and per expense. Flag N+1 patterns and in-memory aggregation that belongs in a pipeline.

**A6. Inventory dead code.** List fields in the schemas that nothing reads or writes (start with `recurring.nextRunAt`), and any documented feature with no implementation behind it.

Stop after Phase 0 and present all six reports before making changes.

---

## Phase 1 — Monetary correctness

**M1. Decide the money representation.** Choose integer minor units (paise) stored as `Number`, or `Decimal128`. Document the decision and the rationale in `docs/adr/001-money-representation.md`. Prefer integer paise unless the audit surfaces a reason not to.

**M2. Introduce a Money value object.** A single module that owns construction, addition, subtraction, multiplication by a scalar, comparison, allocation across N parts, and formatting to INR. Nothing outside this module may perform arithmetic on amounts.

**M3. Migrate the schemas.** Convert `transactions.amount`, `budgets.amount`, `groupexpenses.amount`, `groupexpenses.paidBy[].amount`, `groupexpenses.splits[].shareAmount`, and `settlements.amount`. Write a reversible migration script. Update the seed script in the same commit.

**M4. Format only at the boundary.** Amounts stay integers through services and API responses; conversion to a display string happens in the UI layer alone. Remove any formatting that happens server-side mid-computation.

**M5. Implement explicit remainder allocation.** Pick a documented rule — largest-remainder is the usual choice — so allocated parts always sum exactly to the total. Apply it to equal splits and to percentage splits. Record the rule in the ADR.

**M6. Fix the equality validation.** Sum comparisons must be exact integer equality, never floating-point tolerance. Reject the write when sums disagree, with an error naming the discrepancy.

Done when: no floating-point arithmetic touches a monetary value anywhere in the codebase.

---

## Phase 2 — Authorization

**S1. Build a single access guard.** One helper that resolves the session, loads the requested resource, asserts ownership (personal resources) or active membership (group resources), and throws a typed authorization error otherwise.

**S2. Apply it to every private route.** Every handler in the A3 table gets the guard before any read or write. Route middleware proves a session exists and nothing more — do not rely on it for authorization.

**S3. Scope every query by owner.** Personal queries filter on `userId` in the query itself, not after fetching. Group queries filter on group membership. Never fetch-then-check.

**S4. Normalise error responses.** Return 404 rather than 403 for resources the user may not access, so IDs can't be enumerated. Never leak whether an ID exists.

**S5. Validate every input with Zod at the route boundary.** Including path parameters and query strings, not just request bodies. Reject unknown keys.

**S6. Sanity-check secrets handling.** Confirm no secret is read on the client, no credential appears in a committed file, and `.env.example` contains only placeholder values.

Done when: an authenticated user cannot read or mutate another user's data or a group they don't belong to, by any route.

---

## Phase 3 — Data integrity

**I1. Prevent orphaned references.** Categories become soft-deleted rather than hard-deleted when transactions or budgets reference them. Document the rule.

**I2. Guard member removal.** A member with a non-zero balance cannot be removed from a group. Return a clear error naming the outstanding amount.

**I3. Make settlements idempotent.** Prevent the same settlement being recorded twice by concurrent requests. Either a uniqueness constraint on the settlement's identifying tuple, or make settlement consume a specific suggestion so a repeat is a no-op.

**I4. Enforce membership on splits.** Every `splits[].userId` and `paidBy[].userId` must be a current member of the expense's group at write time. Reject otherwise.

**I5. Add the invariant checks.** Sum of splits equals expense total; sum of payments equals expense total; percentages sum to exactly 100; group net balance across all members sums to zero. Enforce at write time, and expose a diagnostic endpoint that verifies them across existing data.

**I6. Add the missing indexes.** Based on the A5 report — at minimum `transactions` by user and date, `groupexpenses` by group and date, `settlements` by group. Record the query each index serves.

---

## Phase 4 — Tests

**T1. Add a test runner.** Vitest. Add `test` and `test:watch` scripts.

**T2. Test split allocation exhaustively.** Amounts that don't divide cleanly, two through twelve members, percentage splits with repeating decimals, single-member groups, zero amounts. Assert allocated parts always sum exactly to the total.

**T3. Test balance computation.** Multi-payer expenses, partial settlements, a member owing and being owed simultaneously. Assert net balance across the group is always zero.

**T4. Test settlement simplification.** Assert the simplified set discharges the same net positions as the original, and that the transfer count never increases.

**T5. Test authorization.** For each private route, a case proving a non-owner and a non-member are rejected.

**T6. Wire CI.** GitHub Actions running lint, typecheck, and tests on push.

Done when: the money math has coverage you would trust in front of an examiner.

---

## Phase 5 — Architecture (required for the SEML coursework)

**R1. Introduce a service layer.** `TransactionService`, `BudgetService`, `GroupService`, `ExpenseService`, `SettlementService`, `AnalyticsService`. Route handlers parse and validate input, call one service method, and serialise the result. No business logic in route handlers. No direct Mongoose access outside the persistence layer.

**R2. Refactor splits into a Strategy hierarchy.** A common interface with an `allocate` operation, implemented separately for equal, custom, and percentage. Remove the `splitType` conditional. This is the primary object-oriented demonstration for the coursework — keep it clean.

**R3. Separate domain models from persistence models.** Domain types carry no `ObjectId`, no Mongoose types, no `_id`. Mappers translate at the persistence boundary.

**R4. Document the layering.** `docs/adr/002-layered-architecture.md` — the layers, what may depend on what, and the rationale addressing scalability and maintainability. Include why microservices were rejected.

**R5. Record before/after metrics.** Capture cyclomatic complexity and a Chrome DevTools performance profile of the analytics dashboard before and after this phase. The coursework asks for measured refactoring, so keep the numbers.

---

## Phase 6 — Features

Build in this order. Each depends on the previous.

**F1. Append-only ledger.** Store financial events — expense recorded, expense amended, settlement proposed, settlement confirmed, member joined, member left — and derive balances as a fold over the event stream. Stop storing mutable balances. Everything below becomes straightforward once this exists.

**F2. Expense amendment trail.** Editing an expense writes an amendment event rather than overwriting. Original values remain retrievable. All downstream balances recompute.

**F3. Time-travel balances.** A query that returns group balances as at any past timestamp, by folding events up to that point.

**F4. Settlement handshake.** Replace the single-insert settlement with proposed → acknowledged → confirmed, plus rejection and expiry. Only a confirmed settlement affects balances.

**F5. Group share → personal ledger projection.** A member's share of each group expense materialises into their personal ledger, in the correct category and dated to the expense. What a member *paid* and what they *owe* remain distinct. Amending a group expense re-derives the projected entries.

**F6. Receivables in available balance.** Money owed to the user is tracked as a receivable and excluded from spendable balance. Surface "available to spend" as balance minus outstanding receivables minus committed future spend.

**F7. Temporal group membership.** Membership carries validity intervals. Split eligibility is evaluated against the expense date, so a member who joined later is not included in earlier expenses.

**F8. Forward commitments.** Make recurring transactions project into future periods so budget headroom accounts for known upcoming spend. Generation must be idempotent — a given occurrence can never be created twice.

**F9. Recurring group expenses.** Same split rules, generated on schedule, using the F8 idempotency mechanism.

**F10. Pace-aware budget indicators.** Surface budget consumption relative to time elapsed in the cycle, not just the raw percentage.

**F11. Settlement simplification explainer.** A view showing the original transfer set, the simplified set, the reduction achieved, and the reasoning.

**F12. Expense disputes.** A member can contest an expense. It enters a provisional state, affected balances are flagged unconfirmed, and resolution writes an amendment.

**F13. CSV import.** Column mapping, preview, and duplicate detection against existing transactions before commit.

**F14. Natural-language expense entry.** Parse free text into a pre-filled draft the user must confirm. The model produces form values only and never writes to the ledger directly. Validate the parsed output with the same Zod schema as manual entry.

---

## Phase 7 — Documentation cleanup

**D1. Move DBMS artifacts.** Relocate `sql-scripts/`, normalisation notes, ER diagram, and viva notes into `docs/dbms/`. They belong to the previous semester and should not lead the repository.

**D2. Create `docs/seml/`.** One numbered directory per lab assignment.

**D3. Rewrite the README.** Lead with the thesis — a unified ledger where group shares are part of personal budgeting. Remove unearned claims ("advanced", "strong data integrity") until the tests back them. Move the feature list below the architecture summary.

**D4. Write up the Sankey layout.** The hand-rolled flow layout and node sizing is the most technically distinctive code in the repository and is currently invisible. Document the algorithm.

**D5. Fix the security claims.** Remove "private APIs are not publicly documented" as a security statement. Replace with the actual authorization model from Phase 2.

---

## Guardrails

- Do not begin a phase before the previous one passes lint, typecheck, and tests.
- One concern per commit. Schema migrations always travel with their seed-script updates.
- Never assert a defect the audit did not confirm.
- Do not add a feature from Phase 6 while any Phase 1 or Phase 2 item is open.
- If a task turns out to be unnecessary because the code already handles it, say so explicitly rather than making a cosmetic change to appear productive.