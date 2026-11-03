> **Historical snapshot (September 2026, MongoDB codebase).** Phase 0 audit findings from before the move to Supabase. Many file paths and defects listed here no longer exist. The current assessment is [`docs/assessment-2026-11.md`](../assessment-2026-11.md).

# A1 — Codebase Map

_Phase 0 audit. Read-only. No code changed._

## `src/` tree (application code only)

```
src/
├── app/
│   ├── layout.tsx, page.tsx, error.tsx, global-error.tsx
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── (app)/                      # authenticated shell
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── finance/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── groups/page.tsx
│   │   └── groups/[groupId]/page.tsx
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── auth/register/route.ts
│       └── private/…               # see API table below
├── components/
│   ├── analytics/analytics-suite.tsx
│   ├── auth/{login-form,register-form,google-signin-button,sign-out-button}.tsx
│   ├── dashboard/{dashboard-overview.tsx,use-query.ts}
│   ├── finance/finance-manager.tsx
│   ├── groups/{group-manager,group-detail,group-detail-analytics,group-analytics-suite}.tsx
│   ├── landing/landing-motion.tsx
│   ├── layout/app-sidebar.tsx
│   ├── profile/{profile-page,profile-settings}.tsx
│   └── providers/session-provider.tsx
├── lib/                            # see helpers below
├── models/                         # see models below
├── scripts/{seed.ts,dbms-report.ts,verify-users.ts}
└── types/next-auth.d.ts
```

## API routes under `/api`

| Route | Methods | File |
|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | `app/api/auth/[...nextauth]/route.ts` |
| `/api/auth/register` | POST | `app/api/auth/register/route.ts` |
| `/api/private/transactions` | GET, POST | `.../transactions/route.ts` |
| `/api/private/transactions/[transactionId]` | PATCH, DELETE | `.../transactions/[transactionId]/route.ts` |
| `/api/private/transactions/recurring/run` | POST | `.../transactions/recurring/run/route.ts` |
| `/api/private/budgets` | GET, POST | `.../budgets/route.ts` |
| `/api/private/budgets/[budgetId]` | PATCH, DELETE | `.../budgets/[budgetId]/route.ts` |
| `/api/private/categories` | GET, POST | `.../categories/route.ts` |
| `/api/private/categories/[categoryId]` | PATCH, DELETE | `.../categories/[categoryId]/route.ts` |
| `/api/private/dashboard/summary` | GET | `.../dashboard/summary/route.ts` |
| `/api/private/finance/aggregate` | GET | `.../finance/aggregate/route.ts` |
| `/api/private/analytics/summary` | GET | `.../analytics/summary/route.ts` |
| `/api/private/me` | GET, PATCH | `.../me/route.ts` |
| `/api/private/groups` | GET, POST | `.../groups/route.ts` |
| `/api/private/groups/join` | POST | `.../groups/join/route.ts` |
| `/api/private/groups/analytics` | GET | `.../groups/analytics/route.ts` |
| `/api/private/groups/[groupId]` | GET | `.../groups/[groupId]/route.ts` |
| `/api/private/groups/[groupId]/expenses` | GET, POST | `.../groups/[groupId]/expenses/route.ts` |
| `/api/private/groups/[groupId]/settlements` | GET, POST | `.../groups/[groupId]/settlements/route.ts` |
| `/api/private/groups/[groupId]/balances` | GET | `.../groups/[groupId]/balances/route.ts` |
| `/api/private/groups/[groupId]/analytics` | GET | `.../groups/[groupId]/analytics/route.ts` |

**Notable absence:** there is **no** `PATCH`/`DELETE` on `/api/private/groups/[groupId]`, and no member-removal, expense-edit, expense-delete, or settlement-delete endpoint. See A6.

## Mongoose models (`src/models/`)

| Model | Money fields | Key indexes |
|---|---|---|
| `User` | — | `email` unique, `googleId` |
| `Category` | — | `{userId,name,type}` unique sparse; `isSystem` |
| `Transaction` | `amount:Number` | `{userId,transactionDate}`, `{userId,type,transactionDate}`, `{userId,categoryId,transactionDate}` |
| `Budget` | `amount:Number` | `{userId,cycle,periodStart}` |
| `Group` | — | `inviteCode` unique, `members.userId` |
| `GroupExpense` | `amount`, `paidBy[].amount`, `splits[].amount`, `splits[].shareAmount` | `{groupId,incurredAt}` |
| `Settlement` | `amount:Number` | `{groupId,settledAt}`; `{groupId,createdBy,idempotencyKey}` unique partial |

## Service / helper modules (`src/lib/`)

| File | Responsibility |
|---|---|
| `db.ts` | Cached Mongoose connection (`autoIndex: true`) |
| `env.ts` | Zod-validated lazy env accessors |
| `auth.ts` | NextAuth options (Credentials + optional Google), JWT session |
| `api-auth.ts` | `requireUserId()` — resolves session user id or throws `UNAUTHORIZED` |
| `http.ts` | `jsonError()`, `parseDate()` |
| `money.ts` | `roundCurrency`, `assertPositiveAmount`, `approxEqual` |
| `split.ts` | `validatePayers`, `computeShares`, `computePairwiseBalances` |
| `category-access.ts` | `resolveAccessibleCategoryId()` — validates category ownership/system |
| `group-members.ts` | `getGroupMemberIds()` — normalises member ids to strings |
| `object-id.ts` | `toObjectId()` — validates + constructs ObjectId |
| `mongo-errors.ts` | `isMongoDuplicateKeyError()` |
| `invite-code.ts` | `generateInviteCode()` (crockford-ish alphabet, `Math.random`) |
| `default-categories.ts` | `ensureDefaultCategories()` — upserts 7 system categories |
| `user-preferences.ts` | preference defaults / enum values |
| `dbms-reporting.ts` | DBMS coursework report generation |
| `logger.ts` | Structured JSON console logger |

## Pages

Auth: `login`, `register`. App shell `(app)/`: `dashboard`, `finance`, `analytics`, `profile`, `groups`, `groups/[groupId]`. Root `page.tsx` is the marketing landing.

## Architecture observation

There is **no service layer**. Route handlers contain auth + validation + business logic + direct Mongoose access inline. `lib/` holds pure helpers (`split.ts`, `money.ts`) but they are called directly from handlers. Relevant to Phase 5 (R1).
