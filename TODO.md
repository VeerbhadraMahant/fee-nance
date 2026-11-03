# Roadmap

Ordered by value. IDs in brackets refer to the backlog in [`fee-nance-updates.md`](fee-nance-updates.md); `N` items came from the [November 2026 assessment](docs/assessment-2026-11.md). Feature status lives in [`docs/features.md`](docs/features.md).

## Now — correctness

- [x] **N1** Recurrence clamps to month-end (31 Jan → 28 Feb → 31 Mar), with a check for it
- [x] **N2** One occurrence per rule per date, enforced in the schema; generation safe to run concurrently [F8]
- [x] **N3** Generate due recurring entries automatically instead of from a button (on app open; there is no background scheduler yet)
- [x] **N4** Block leaving a group while owing or owed [I2]; the owner leaving hands ownership to another member instead of deleting the group
- [x] **N5** `create_group_expense` compares sums exactly, matching the documented contract [M6]
- [x] **N6** Only a party to a settlement (payer or payee) may record it
- [x] **N7** Rate-limit the copilot per user

## Next — core product

- [x] **N8** Choose participants for an equal split
- [x] **N9** Edit and delete group expenses
- [x] **N10** Delete settlements
- [x] **N11** Group shares count in personal budgets and totals, by category [F5]
- [x] **N12** UPI settle-up links from a UPI ID on the profile
- [x] **N13** Gemini receipt extractor behind the existing registry (untested against the live model)
- [x] **N14** Pace-aware budgets [F10]

## Later — growth

- [x] **N15** CSV statement import with column mapping, preview and duplicate detection [F13]
- [x] **N16** Copilot drafts entries from free text for the user to confirm [F14]; copilot reads group balances
- [ ] **N17** Reminders by email or push. (The web manifest for installing the app is done; there is no offline mode)
- [ ] **N18** Money value object in integer paise everywhere [M1–M4]
- [ ] **N19** Service layer and split strategy classes for the SEML coursework [R1–R4]
- [ ] **N20** Vitest suite, including per-route authorization tests [T1–T5]

## Housekeeping

- [x] Archive MongoDB-era DBMS docs under `docs/dbms/` [D1]
- [x] Rewrite current docs for Supabase: overview, features, architecture, database, API, secrets, demo, QA
- [x] Remove the stray `.github/agents/tasksync.agent.md`
- [x] Remove the unused `computePairwiseBalances`
- [x] Landing page copy: drop "shortest set of payments", mention itemized splits, insights, tax and copilot
- [x] Sankey write-up [D4]: dropped. The layout is Recharts' own and the custom group Sankeys were replaced by bar charts, so there is no algorithm of ours to document

## Deferred

Event-sourced ledger, amendment trail, time-travel balances, settlement handshake and disputes [F1–F4, F12]. High complexity and little user value at this scale; revisit only if the coursework requires them.
