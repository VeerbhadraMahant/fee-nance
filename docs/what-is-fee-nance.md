# What is Fee-Nance?

Fee-Nance is a web app for personal finance and shared expenses, built for Indian users and INR.

## The problem

Most people track their own spending in one app and split group bills in another. Neither view is complete: the budgeting app never sees the ₹1,200 that was your share of a group dinner, and the splitting app knows nothing about your budget. Splitwise, the default splitter, now limits free users to a handful of expenses a day and charges for receipt scanning and charts.

## The idea

One ledger. Your personal income and expenses, and your share of every group bill, count towards the same budgets, totals and insights. What you *paid* for a group and what you *owe* stay distinct, so lending money to friends doesn't look like spending it.

## Who it's for

- Students and young professionals sharing a flat, a hostel room or a trip
- Anyone who wants budgeting and bill-splitting without running two apps
- People filing Indian income tax who want to see which regime suits them

## What it does

- **Track**: income, expenses, categories, budgets (monthly, quarterly, yearly) and recurring entries such as rent, salary and subscriptions.
- **Split**: groups with invite codes, several payers on one bill, and equal, exact, percentage or itemized splits. In an itemized split, tax and tip are spread in proportion to what each person ordered.
- **Settle**: per-member balances, suggested payments that clear them, and settlement records.
- **Understand**: analytics, a 90-day cash-flow forecast, unusual-spend and duplicate-charge detection, a financial health score and a printable monthly report.
- **Plan**: savings goals, and an old-versus-new tax regime comparison for FY 2026-27.
- **Ask**: a copilot that answers questions about your own ledger. It can read but never write.

The live status of each feature, including what is unfinished, is in [`features.md`](features.md).

## What makes it different

- Itemized splitting computed in integer paise, so a bill of many indivisible items always sums exactly and nobody systematically absorbs the rounding.
- A tax planner that pre-fills deductions from your own transactions — no splitting app has one.
- Insights computed by SQL window functions: each expense is judged against the history of its own category, not a global average.
- No daily limits and nothing behind a paywall.

## Technical foundation

Next.js 16 (App Router) and React 19 on Supabase: Postgres with row-level security, Supabase Auth with Google sign-in, and an optional Upstash Redis cache. See [`architecture.md`](architecture.md) and [`database.md`](database.md).

## Origin

Fee-Nance began as a DBMS mini-project on MongoDB and moved to Supabase Postgres in October 2026. The DBMS coursework from the MongoDB period is archived in [`dbms/`](dbms/).
