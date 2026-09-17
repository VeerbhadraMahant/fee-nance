# Private API Module Reference

All routes under `/api/private/*` require an authenticated session.

## Authentication Namespace

- `POST /api/auth/register`
  - Create email/password account.
- `/api/auth/[...nextauth]`
  - NextAuth handlers (credentials + optional Google OAuth).

## Profile Module

- `GET /api/private/me`
  - Fetch current user profile + preferences.
- `PATCH /api/private/me`
  - Update profile name/preferences.

## Dashboard Module

- `GET /api/private/dashboard/summary`
  - Aggregated totals, category breakdown, monthly trend, group count.
  - Query params: `startDate`, `endDate`.

## Insights Module

- `GET /api/private/insights`
  - Outlier expenses, duplicate charges, category drift and a 90-day cash-flow
    projection, in one payload.
  - Query params: `startDate`, `endDate` (these bound the diagnostics only —
    the forecast always runs forward from today).
  - Read-only. Nothing is written and no flag is stored; every detector
    recomputes per request.
  - Requires MongoDB 5.0+ (`$setWindowFields`). See `docs/insights-pipelines.md`.

## Finance Module

- `GET /api/private/finance/aggregate`
  - Returns categories, transactions, budgets in one payload.
  - Query params: `startDate`, `endDate`.

### Transactions

- `GET /api/private/transactions`
  - List transactions with summary and optional pagination.
  - Query params:
    - `startDate`, `endDate`
    - `type` (`income|expense`)
    - `page`, `limit`
    - `sortBy` (`transactionDate|amount|createdAt|title`)
    - `sortOrder` (`asc|desc`)
- `POST /api/private/transactions`
  - Create transaction.
- `PATCH /api/private/transactions/[transactionId]`
  - Update transaction.
- `DELETE /api/private/transactions/[transactionId]`
  - Delete transaction.
- `POST /api/private/transactions/recurring/run`
  - Generate due recurring transaction instances.

### Categories

- `GET /api/private/categories`
  - List system + user categories.
- `POST /api/private/categories`
  - Create custom category.
- `PATCH /api/private/categories/[categoryId]`
  - Update custom category.
- `DELETE /api/private/categories/[categoryId]`
  - Delete custom category.

### Budgets

- `GET /api/private/budgets`
  - List budgets.
  - Query params: `startDate`, `endDate`.
- `POST /api/private/budgets`
  - Create budget.
- `PATCH /api/private/budgets/[budgetId]`
  - Update budget.
- `DELETE /api/private/budgets/[budgetId]`
  - Delete budget.

## Group Module

### Groups and Membership

- `GET /api/private/groups`
  - List groups for current member with pagination/search support.
  - Query params: `page`, `limit`, `sortBy`, `sortOrder`, `search`.
- `POST /api/private/groups`
  - Create group and owner membership.
- `POST /api/private/groups/join`
  - Join group using invite code.
- `GET /api/private/groups/[groupId]`
  - Get group details.

### Group Expenses

- `GET /api/private/groups/[groupId]/expenses`
  - List group expenses (filter/sort/pagination).
  - Query params: `startDate`, `endDate`, `createdBy`, `page`, `limit`, `sortBy`, `sortOrder`.
- `POST /api/private/groups/[groupId]/expenses`
  - Create shared group expense.
  - Supports split types: `equal`, `custom`, `percentage`, `itemized`, and
    multiple payers.
  - `itemized` requires a `lineItems` array (`label`, `amount`, `sharedBy[]`,
    optional `proportional` for tax/tip). It is rejected on any other split
    type, and any other split type is rejected without it.

### Receipt Extraction

- `GET /api/private/receipts/extract`
  - Reports whether an OCR extractor is configured (`{ configured: boolean }`),
    so the UI can hide the scan button when it would only fail.
- `POST /api/private/receipts/extract`
  - Body: `{ base64, mimeType }`, image capped near 5 MB.
  - Returns a **draft** set of line items for the user to confirm. The image is
    never persisted and this route never writes to the ledger.
  - `501` when no extractor is configured — the intended state until a model is
    plugged into `src/lib/receipt/registry.ts`.

### Group Balances

- `GET /api/private/groups/[groupId]/balances`
  - Compute per-member net + simplified pairwise settlement suggestions.

### Group Settlements

- `GET /api/private/groups/[groupId]/settlements`
  - List settlement history with filters/pagination.
  - Query params: `startDate`, `endDate`, `fromUserId`, `toUserId`, `page`, `limit`, `sortBy`, `sortOrder`.
- `POST /api/private/groups/[groupId]/settlements`
  - Create manual settlement.
  - Optional idempotency header: `x-idempotency-key` (or `idempotency-key`).

## Error Semantics

Common status patterns:
- `401` unauthorized (no active session)
- `403` forbidden (not permitted for resource)
- `404` not found
- `422` validation/business-rule failure
- `500` unexpected server error
