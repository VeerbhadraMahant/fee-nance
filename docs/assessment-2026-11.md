# Fee-Nance assessment — November 2026

A snapshot review of the repository on 2026-11-03 (commit `daeae69`), covering what works, what doesn't, how the product compares with similar apps, and how far the backlog has got. Live feature status is kept in [`features.md`](features.md); this document records the state at the time of the review and is not updated as items are fixed.

## Summary

The engineering is well above typical coursework: row-level security on every table, atomic SQL functions for group writes, paise-exact itemized splitting, and a CI pipeline that tests the database and the money logic. Lint, typecheck, `verify:calc` (65 checks), `verify:db` (42 checks) and `next build` all pass from a clean install.

The product thesis was not yet implemented. The README says Fee-Nance unifies personal and group finance, but at review time a user's share of a group expense never reached their personal budgets, dashboard totals, health score or copilot. The two halves of the app sat side by side without touching. That single gap (backlog item F5) is the difference between Fee-Nance and "Splitwise plus a budgeting app".

## How it was checked

- Read the schema, SQL functions, split engine, every group route, the recurring runner, the cache, the copilot and the receipt pipeline.
- Ran `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npm run verify:calc`, `npm run verify:db`, `npm run build`. All green.
- Not checked: behaviour against the live Supabase project (no credentials in the review environment) and the UI in a browser.

## Competitive landscape

| Product | Strength | Where Fee-Nance stands |
|---|---|---|
| Splitwise | The default for group splitting. The free tier now caps expenses per day (reported as roughly 3–5) and puts receipt scanning, charts and currency conversion behind Pro (about $40/year) | Fee-Nance offers itemized splits, charts and analytics with no caps |
| The Hisaab, FairShare, FamZam, Niptao | India-first splitters: UPI settle-up links, no daily limits, some with free AI receipt scanning | No UPI; receipt scanning was a stub |
| Tricount, Settle Up, Splid | Trips, multi-currency, offline use | INR only, online only |
| Axio (formerly Walnut), Moneyview | Automatic tracking by reading bank SMS | Manual entry only — the largest usability gap |
| Fold | Bank data through RBI's Account Aggregator framework, consent-based | No automated import of any kind |
| Spend Together, Sliceup, no drama, Divide | Small apps pitching "budget and splits in one" | Direct competition on the thesis, though none clearly books a split share against personal budget limits |

Most comparisons above come from vendors' own blogs and store listings, so treat pricing and feature claims about competitors as approximate.

### What is distinctive

1. **Itemized splitting with proportional tax and tip**, computed in integer paise with largest-remainder allocation. Few apps do this; Splitwise charges for its version.
2. **Indian tax planner**: old against new regime with 87A rebate and marginal relief, deductions pre-filled from transaction titles. The FY 2026-27 slabs were checked against Budget 2026 and are correct. No splitting app has this.
3. **SQL-native insights**: outliers judged against each category's own trailing window, duplicate-charge detection, category drift.
4. **A ledger-grounded copilot** whose tools are read-only and scoped by row-level security.
5. **The unified thesis itself**, once group shares feed personal budgets.

## What is good

- **Security model.** RLS on every table; each route verifies the JWT with `getClaims()`; another user's id returns 404, the same as a missing one. `verify:db` tests the policies.
- **Atomic group writes.** An expense with its payers and splits commits in one SQL transaction that re-checks membership and totals.
- **PostgREST row cap handled.** `selectAll` pages past the 1,000-row default, which many Supabase projects silently hit.
- **Cache design.** Per-user version numbers make stale reads impossible after a write; the cache fails open.
- **CI** runs lint, typecheck, calculation checks, database checks and a build without secrets.
- **Honest README limitations.**

## What was wrong

### Product gaps

1. Group shares did not reach personal budgets, totals, health score or copilot (F5).
2. An equal split always included every group member; there was no way to split equally among the three of five people who were at dinner.
3. Group expenses and settlements could not be edited or deleted.
4. Receipt scanning was an interface with no implementation registered, so the scan button never appeared — even though Gemini was already integrated for the copilot.
5. Recurring entries were generated only when someone pressed a dashboard button.
6. No UPI settle-up, no reminders, no installable app, no import.

### Confirmed defects

1. **Month-end recurrence drift.** `getNextDate` used `Date.setMonth`, which overflows short months: a rule on 31 January produced 3 March, then the 3rd of every month after. The verification check started on the 15th and missed it.
2. **Recurring generation was not idempotent.** Two concurrent runs could insert the same occurrences; nothing in the schema linked an occurrence to its rule.
3. **Leaving a group with an outstanding balance broke settle-up.** Balances still counted the departed member, so a payment to them was suggested, and recording it failed because they were no longer a member.
4. **The owner leaving deleted the group for everyone**, history included, with no ownership transfer.
5. **Rounding contract mismatch.** The README promised exact equality; `create_group_expense` accepted a 0.01 discrepancy, letting a paisa of drift into balances.
6. **Any member could record a settlement between two other members** without either party being involved.
7. **The copilot had no rate limit**, so any signed-in user could spend the project's Gemini quota (up to six model calls per question).

### Repository hygiene

- Sixteen documents still described MongoDB, NextAuth or email/password login, and referenced `npm run dbms:report`, which no longer exists.
- `TODO.md` was entirely stale.
- `computePairwiseBalances` in `lib/split.ts` duplicated the balances route's logic and had no callers.
- `.github/agents/tasksync.agent.md` was an unrelated third-party agent prompt.
- `.env.example` listed `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, which the code never read, and the README's environment table omitted the Gemini variables.
- The landing page claimed the "shortest set of payments" (the algorithm is a greedy match, which is not guaranteed minimal) while omitting itemized splits, insights, tax and the copilot.

## Progress at review time

### Product features

| Area | Status |
|---|---|
| Google sign-in, profiles | Done |
| Transactions, categories, budgets | Done |
| Recurring transactions | ~60% — manual trigger, month-end drift, not idempotent |
| Groups, invite codes, multi-payer, four split types | ~75% — no edit/delete, equal split always uses everyone |
| Balances and settlements | ~70% — breaks when a member leaves; no confirmation |
| Receipt OCR | ~15% — interface only |
| Analytics, insights, Sankey charts | Done |
| Goals, tax planner, monthly report, health score | Done |
| Copilot | ~70% — read-only, no group data, no rate limit |
| Group share in personal budget (the thesis) | 0% |

### Backlog (`fee-nance-updates.md`)

| Phase | Done | Notes |
|---|---|---|
| 0 Audit | ~100% | `docs/audit/` (MongoDB era) |
| 1 Monetary correctness | ~25% | `numeric(15,2)` storage, paise in itemized splits; no Money value object, floats elsewhere |
| 2 Authorization | ~90% | RLS carries it; Zod schemas strip rather than reject unknown keys |
| 3 Data integrity | ~60% | Idempotent settlements, membership on splits, indexes, diagnostics done; leave-with-balance guard and category soft-delete open |
| 4 Tests | ~50% | CI and verify scripts; no Vitest, no per-route authorization tests |
| 5 Architecture (SEML) | ~15% | Mappers only; no service layer, split strategies, or ADRs |
| 6 Features F1–F14 | ~5% | CSV export exists; no F-item complete |
| 7 Documentation | ~40% | README rewritten; DBMS docs not yet moved |

## Recommendations

### Add, in order

1. Book group shares into personal budgets and totals (F5).
2. Choose participants for an equal split; edit and delete group expenses and settlements.
3. UPI settle-up links (`upi://pay?...`), using a UPI ID stored on the profile.
4. A Gemini receipt extractor behind the existing registry.
5. Correct recurrence: clamp to month-end, generate automatically, and enforce one occurrence per rule per date in the schema.
6. Statement import (CSV) with duplicate detection — the web-realistic substitute for SMS reading.
7. Pace-aware budgets (F10): spend against time elapsed in the period.
8. Copilot drafts entries from free text for the user to confirm (F14), gains group tools, and is rate limited.

### Remove or defer

- Remove the stray agent prompt, dead split helper and stale Mongo-era docs (archive the DBMS coursework under `docs/dbms/`).
- Defer F1–F4 and F12 (event-sourced ledger, time-travel balances, disputes) unless the coursework requires them: high complexity, low user value at this scale.
- Consider merging Analytics, Insights, Report and the health score into fewer pages; they overlap heavily.

## Sources

- [Tricount — Splitwise alternatives in India](https://tricount.com/en-us/blog/top-splitwise-alternatives-in-india-2025-which-app-should-you-switch-to)
- [FairShare — Splitwise alternatives in India 2026](https://fairshareapp.co.in/blog/top-5-splitwise-alternatives-india.html)
- [The Hisaab — expense splitting apps in India](https://thehisaab.com/blog/best-expense-splitting-apps-india-2025)
- [FamZam — Splitwise alternative with UPI](https://famzam.app/blog/splitwise-alternative-india)
- [Niptao — free bill split apps 2026](https://niptao.app/en/blog/best-free-bill-split-apps-2026)
- [HisabAI — bill splitting apps in India](https://hisabai.in/en/best-bill-splitting-apps-india)
- [Splitwise pricing 2026 (getfinny)](https://getfinny.app/blog/splitwise-pricing-2026)
- [Splitwise free vs Pro](https://split-circle-landing.pages.dev/en/blog/splitwise-free-vs-pro)
- [Locals Insider — Splitwise review](https://localsinsider.com/apps/track-shared-costs-splitwise-app/)
- [Fintrakk — expense trackers in India 2026](https://fintrakk.com/best-personal-expense-tracker-app-india/)
- [TrackMyRupee vs Axio vs Money Manager](https://trackmyrupee.com/blog/trackmyrupee-vs-walnut-axio-vs-money-manager-which-expense-tracker-is-best-for-indians-in-2026/)
- [Moneyview — expense tracker apps](https://moneyview.in/insights/best-personal-finance-management-apps-in-india)
- [Spend Together (App Store)](https://apps.apple.com/la/app/spend-together/id1446549608)
- [no drama (Product Hunt)](https://www.producthunt.com/p/nodrama/no-drama)
- [Sliceup (Product Hunt)](https://www.producthunt.com/products/sliceup)
- [Scroll — Budget 2026 keeps slabs unchanged](https://scroll.in/latest/1090410/scroll_in)
- [Business Today — new regime deductions from April 2026](https://businesstoday.in/personal-finance/tax/story/income-tax-2026-what-deductions-you-lose-under-new-tax-regime-from-april-1-523398-2026-04-01)
