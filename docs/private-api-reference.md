# Private API reference

Every route under `/api/private/*` requires a signed-in Supabase session (the auth cookie set by `/auth/callback`). Each handler verifies the JWT itself, validates input with Zod and queries Postgres as the user, so row-level security limits every response to the caller's own data and the groups they belong to.

Dates are ISO 8601 strings. Amounts are rupees as JSON numbers with at most two decimals.

## Errors

| Status | Meaning |
|---|---|
| `401` | No valid session |
| `404` | Not found — also returned for a resource that exists but belongs to someone else, and for a malformed id |
| `409` | Unique constraint conflict (for example a duplicate category name) |
| `422` | Validation or business-rule failure; the body's `error` names the first problem |
| `429` | Rate limited (copilot, upstream model) |
| `501` | Feature not configured (receipt extraction) |
| `502`, `503` | Upstream model unavailable, or Supabase not configured |
| `500` | Unexpected error (logged) |

Error bodies are `{ "error": "message" }`.

## Auth (outside `/api/private`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/callback` | Google OAuth return; exchanges the code for a session and redirects to `next` (same-origin only) |
| POST | `/auth/signout` | Ends the session |

## Profile

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/private/me` | Profile and preferences |
| PATCH | `/api/private/me` | Body: `name?`, `preferences: { currency?: "INR", dashboardDefaultRange? }` |

## Dashboard, analytics, reports

| Method | Path | Query | Purpose |
|---|---|---|---|
| GET | `/api/private/dashboard/summary` | `startDate`, `endDate` | Totals, category breakdown, monthly trend, recent activity |
| GET | `/api/private/analytics/summary` | `startDate`, `endDate` | Sankey, trajectory, composition, quarterly and efficiency data |
| GET | `/api/private/finance/aggregate` | `startDate`, `endDate` | Categories, transactions and budgets in one payload |
| GET | `/api/private/insights` | `startDate`, `endDate` | Outliers, duplicates, drift (bounded by the range) and a 90-day forecast (always from today) |
| GET | `/api/private/insights/recurring` | — | Repeating payees with no recurring rule, and overlapping subscriptions |
| GET | `/api/private/health` | — | Financial health score and its five pillars |
| GET | `/api/private/report` | `month` (`YYYY-MM`) | One-month statement |
| GET | `/api/private/tax/profile` | — | Income and deductions inferred from the ledger, for the tax planner |
| GET | `/api/private/diagnostics` | — | Checks group invariants across the caller's groups; read-only |

All of these except `finance/aggregate` and `diagnostics` are cached when Redis is configured.

## Transactions

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/private/transactions` | List with totals. Query: `startDate`, `endDate`, `type`, `page`, `limit` (≤100), `sortBy` (`transactionDate`, `amount`, `createdAt`, `title`), `sortOrder` |
| POST | `/api/private/transactions` | Body: `type`, `title`, `amount`, `transactionDate`, `notes?`, `categoryId?`, `recurring?: { enabled, frequency?, nextRunAt? }` |
| PATCH | `/api/private/transactions/[transactionId]` | Partial update |
| DELETE | `/api/private/transactions/[transactionId]` | Delete |
| POST | `/api/private/transactions/recurring/run` | Materialise every due occurrence of the caller's recurring rules |

Without `page` or `limit`, the list returns every matching row.

## Categories

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/private/categories` | System and own categories |
| POST | `/api/private/categories` | Create: `name`, `type`, `icon?`, `color?` |
| PATCH | `/api/private/categories/[categoryId]` | Update an own category |
| DELETE | `/api/private/categories/[categoryId]` | Delete an own category; its transactions become uncategorised |

## Budgets

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/private/budgets` | Budgets with spend. Query: `startDate`, `endDate` |
| POST | `/api/private/budgets` | Create: `name`, `amount`, `cycle`, `periodStart`, `periodEnd`, `categoryId?` |
| PATCH | `/api/private/budgets/[budgetId]` | Update |
| DELETE | `/api/private/budgets/[budgetId]` | Delete |

## Goals

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/private/goals` | Goals with projections against the average monthly surplus |
| POST | `/api/private/goals` | Create |
| PATCH | `/api/private/goals/[goalId]` | Update, including contributions |
| DELETE | `/api/private/goals/[goalId]` | Delete |

## Groups

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/private/groups` | Groups the caller belongs to. Query: `page`, `limit`, `sortBy` (`createdAt`, `name`), `sortOrder`, `search` |
| POST | `/api/private/groups` | Create: `name`. The caller becomes owner |
| POST | `/api/private/groups/join` | Join: `inviteCode` |
| GET | `/api/private/groups/[groupId]` | Group with members |
| DELETE | `/api/private/groups/[groupId]` | Owner: delete the group for everyone. Member: leave |
| GET | `/api/private/groups/analytics` | Cross-group analytics |
| GET | `/api/private/groups/[groupId]/analytics` | One group's analytics |

### Group expenses

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/private/groups/[groupId]/expenses` | Query: `startDate`, `endDate`, `createdBy`, `page`, `limit`, `sortBy` (`incurredAt`, `amount`, `createdAt`), `sortOrder` |
| POST | `/api/private/groups/[groupId]/expenses` | Create (below) |

Create body:

```json
{
  "title": "Dinner",
  "amount": 1500,
  "splitType": "equal | custom | percentage | itemized",
  "paidBy": [{ "userId": "…", "amount": 1500 }],
  "splits": [{ "userId": "…", "amount": 500 }],
  "lineItems": [{ "label": "Pizza", "amount": 900, "sharedBy": ["…"], "proportional": false }],
  "incurredAt": "2026-11-03T19:30:00.000Z",
  "notes": "optional"
}
```

- `splits` carries `amount` for custom splits and `percentage` for percentage splits; it is ignored for equal splits, which divide across every member.
- `lineItems` is required for `itemized` and rejected otherwise. Lines with `proportional: true` (tax, tip, service charge) are spread by each member's subtotal on the priced lines.
- Payer amounts and computed shares must each sum to `amount`, or the request is rejected with `422`.

### Balances and settlements

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/private/groups/[groupId]/balances` | Net per member and suggested pairwise payments |
| GET | `/api/private/groups/[groupId]/settlements` | Query: `startDate`, `endDate`, `fromUserId`, `toUserId`, `page`, `limit`, `sortBy` (`settledAt`, `amount`, `createdAt`), `sortOrder` |
| POST | `/api/private/groups/[groupId]/settlements` | Body: `fromUserId`, `toUserId`, `amount`, `note?`, `settledAt?`. Optional header `x-idempotency-key` (8–128 chars): a repeat with the same key returns the original with `idempotent: true` |

## Receipts

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/private/receipts/extract` | `{ configured: boolean }`, so the UI can hide the scan button |
| POST | `/api/private/receipts/extract` | Body: `{ base64, mimeType }` (JPEG, PNG or WebP, about 5 MB). Returns draft line items; never stores the image or writes to the ledger. `501` when no extractor is configured |

## Copilot

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/private/copilot` | `{ available: boolean }` — whether `GEMINI_API_KEY` is set |
| POST | `/api/private/copilot` | Body: `{ messages: [{ role: "user" | "assistant", content }] }` (≤30 messages, last from the user). Returns `{ reply, steps }` |
