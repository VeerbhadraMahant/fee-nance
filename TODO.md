# Fee-Nance Implementation TODO

## Project Direction Confirmed
- Database: MongoDB only
- Build order: MVP first
- Requirement: Actual implementation required for DBMS mini-project
- DBMS strategy: MongoDB runtime + SQL scripts folder for documentation only
- Authentication: Email/password + Google OAuth
- Scope: Single account per user, multi-group membership
- Currency: INR only (for now)
- Budget cycles: Monthly, quarterly, yearly
- Recurring frequencies in MVP: Monthly and yearly only
- Recurring transactions: Included in MVP
- Filters: Custom date range required
- Group expenses: Equal, custom, and percentage splits + multiple payers
- Settlements: Manual only, with per-user net amount visibility
- Settlement display: Simplified pairwise balances
- UX direction: Dark luxury editorial with cinematic tech feel
- Mobile-first responsive implementation required
- Data layer choice: Mongoose

## Phase 0 - Scope and Constraints
- [ ] Capture exact faculty rubric and submission checklist
- [ ] List mandatory DBMS artifacts and proof format (screenshots, SQL scripts folder, demo)
- [ ] Define non-negotiable MVP scope boundaries
- [ ] Exclude post-MVP items from current build

## Phase 1 - Product and Tech Foundation
- [ ] Initialize Next.js (TypeScript + App Router)
- [ ] Set up UI styling system and reusable component structure
- [ ] Integrate Mongoose data layer
- [ ] Configure linting, formatting, and strict TypeScript rules
- [ ] Create environment variable template and secrets policy
- [ ] Add logging and error boundary strategy
- [ ] Implement dark luxury editorial visual system (typography, palette, depth, motion)
- [ ] Lock mobile-first breakpoints and interaction patterns

## Phase 2 - Data Modeling
- [ ] Finalize core entities and attributes (User, Transaction, Category, Budget, Group, GroupExpense, Settlement, RecurringRule)
- [ ] Define MongoDB collections and document shape
- [ ] Design indexes for query performance
- [ ] Create ER diagram for DBMS documentation
- [ ] Create relational mapping document from ER model for academic deliverables
- [ ] Normalize relational mapping to 3NF in documentation

## Phase 3 - Authentication and User Setup
- [ ] Implement email/password auth (sign-up/login/logout)
- [ ] Implement Google OAuth login
- [ ] Add secure session management
- [ ] Protect private routes and API endpoints
- [ ] Add basic profile and preferences support

## Phase 4 - Personal Finance MVP
- [ ] Transactions CRUD (income and expense)
- [ ] Categories CRUD (system + custom categories)
- [ ] Budgets CRUD (monthly, quarterly, yearly)
- [ ] Recurring transaction rules and instance generation
- [ ] Currency enforcement (INR)
- [ ] Running balance calculation
- [ ] Monthly summary aggregation
- [ ] Category-wise summary aggregation
- [ ] Custom date range filtering for lists and reports
- [ ] Validation and error responses

## Phase 5 - Group Expense MVP
- [ ] Group creation and membership management
- [ ] Record shared expense in group
- [ ] Split logic: equal split
- [ ] Split logic: custom amount split
- [ ] Split logic: percentage split
- [ ] Support multiple payers per expense
- [ ] Compute net owes/owed per member
- [ ] Manual settlement entry and balance adjustment
- [ ] Show per-person net amount to settle
- [ ] Group ledger history view

## Phase 6 - API and Business Logic Hardening
- [ ] Add DTO/schema validation for all APIs
- [ ] Add authorization checks for group actions
- [ ] Add idempotency safeguards for settlement operations
- [ ] Add pagination/filter/sort support for transaction and group history
- [ ] Keep APIs private and protected (no public/open endpoints)
- [ ] Enforce split and payer amount totals to exactly match expense total

## Phase 7 - Frontend Screens (MVP)
- [ ] Auth pages
- [ ] Dashboard (income, expense, balance, monthly trend)
- [ ] Transactions page (list, filter, create, edit, delete)
- [ ] Categories and budgets page
- [ ] Groups page (group list, balances, add expense, settle up)
- [ ] Responsive behavior for mobile and desktop

## Phase 8 - Demo Data and QA
- [ ] Seed script for realistic demo data
- [ ] Add demo accounts and sample transactions
- [ ] Manual QA checklist for all MVP flows

## Phase 9 - DBMS Deliverables (MongoDB-Compatible Strategy)
- [ ] Build equivalent scripted operations for advanced logic in backend services
- [ ] Create sql-scripts folder with documentation-only SQL files (DDL, DML, joins, subqueries, GROUP BY, HAVING)
- [ ] Prepare documented query set mapping to DDL/DML and advanced query concepts
- [ ] Produce reproducible outputs for joins/subquery-like reporting via aggregation pipelines
- [ ] Document trigger/procedure/function/cursor equivalents as implemented logic flows
- [ ] Prepare viva explanation notes for MongoDB vs relational concept mapping

## Phase 10 - Final Documentation and Submission
- [ ] Complete README with setup, env, run instructions
- [ ] Add architecture diagram and module flow
- [ ] Add ER diagram and normalization notes
- [ ] Add private API module reference
- [ ] Add demo script with sample accounts and scenarios

## Suggested Build Sequence
1. Foundation setup
2. Auth
3. Personal finance MVP
4. Group expense MVP
5. Demo data + manual QA
6. DBMS mapping deliverables
