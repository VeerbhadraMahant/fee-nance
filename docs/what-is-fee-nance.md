# What is Fee-Nance?

Fee-Nance is a full-stack web application for personal finance tracking and group expense management. It is designed to help users understand where their money goes, plan spending through budgets, and settle shared costs in groups with clear, auditable calculations.

## In One Line

Fee-Nance is a practical money management app that combines individual budgeting and shared expense splitting in a single, secure platform.

## Why Fee-Nance Exists

Many users manage personal expenses in one app and group expenses in another, which creates friction and incomplete financial visibility. Fee-Nance solves this by combining both workflows:

- Personal finance tracking for day-to-day money control.
- Group expense collaboration for trips, roommates, events, or shared projects.
- A unified dashboard for quick financial insight.

## Core Capabilities

### 1. Personal Finance Management

- Create and manage transactions (income and expense).
- Organize spending with system and custom categories.
- Set budgets across monthly, quarterly, and yearly cycles.
- View summary insights like totals, category breakdown, and balance.
- Generate recurring entries for repeating transactions.

### 2. Group Expense Management

- Create groups and invite members with invite codes.
- Add shared expenses with support for multiple payers.
- Split expenses using equal, custom, or percentage methods.
- Enforce strict validations so split amounts match totals.
- Compute per-member net balances.
- Suggest simplified pairwise settlements.
- Record manual settlements with idempotent write support.

### 3. Authentication and Access Control

- Secure sign in using email/password.
- Optional Google OAuth support.
- Protected private APIs and protected dashboard routes.

## Typical User Journey

1. A user signs in and lands on the dashboard.
2. They track personal income and expenses in Finance.
3. They define budgets and monitor spending trends.
4. They create or join groups to manage shared costs.
5. They add group expenses and review who owes whom.
6. They record settlements and keep balances up to date.

## Technical Foundation

Fee-Nance is built with modern web technologies:

- Next.js App Router and React
- TypeScript
- Tailwind CSS
- NextAuth for authentication
- MongoDB Atlas with Mongoose
- Zod for validation

## Data and DBMS Perspective

At runtime, Fee-Nance uses MongoDB (document model). For academic DBMS mapping and evaluation, the project also includes relational SQL deliverables (DDL, DML, JOIN/subquery examples, and GROUP BY/HAVING mappings) to show one-to-one conceptual equivalence.

## What Makes It Useful

- Real-world usability: works for both solo and collaborative finance scenarios.
- Financial clarity: users can quickly inspect spending, budgets, and balances.
- Data integrity: validations prevent inconsistent split and settlement states.
- Demonstrable architecture: suitable for product demos, coursework, and viva discussions.

## Project Scope

Fee-Nance currently focuses on an MVP that is complete enough for practical usage and DBMS demonstration:

- Personal finance essentials
- Group expense and settlement workflows
- Protected APIs and structured error handling
- Reproducible reporting outputs for DBMS documentation

Future enhancements can build on this foundation with notifications, advanced analytics, and deeper automation.
