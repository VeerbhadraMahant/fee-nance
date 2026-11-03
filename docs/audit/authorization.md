> **Historical snapshot (September 2026, MongoDB codebase).** Phase 0 audit findings from before the move to Supabase. Many file paths and defects listed here no longer exist. The current assessment is [`docs/assessment-2026-11.md`](../assessment-2026-11.md).

# A3 — Authorization Trace

_Phase 0 audit. Read-only._

Every route under `/api/private` is additionally gated by `middleware.ts` (proves a session exists). The table below records whether the **handler itself** independently verifies the session user owns the resource / belongs to the group **before** reading or writing.

| Route | Method | Resource | Ownership check in handler? | Mechanism | File:line |
|---|---|---|---|---|---|
| `/transactions` | GET | own transactions | ✅ | query scoped `userId` | `transactions/route.ts:74` |
| `/transactions` | POST | own transaction | ✅ | writes `userId` from session; category via `resolveAccessibleCategoryId` | `transactions/route.ts:164-167` |
| `/transactions/[id]` | PATCH | own transaction | ✅ | `findOne({_id,userId})` | `transactions/[transactionId]/route.ts:37-40` |
| `/transactions/[id]` | DELETE | own transaction | ✅ | `findOneAndDelete({_id,userId})` | `transactions/[transactionId]/route.ts:110-113` |
| `/transactions/recurring/run` | POST | own recurring txns | ✅ | query scoped `userId` | `transactions/recurring/run/route.ts:28-33` |
| `/budgets` | GET | own budgets | ✅ | query scoped `userId` | `budgets/route.ts:32` |
| `/budgets` | POST | own budget | ✅ | writes `userId`; category via helper | `budgets/route.ts:72-75` |
| `/budgets/[id]` | PATCH | own budget | ✅ | `findOne({_id,userId})` | `budgets/[budgetId]/route.ts:30-33` |
| `/budgets/[id]` | DELETE | own budget | ✅ | `findOneAndDelete({_id,userId})` | `budgets/[budgetId]/route.ts:94-97` |
| `/categories` | GET | system + own | ✅ | query `$or:[isSystem, userId]` | `categories/route.ts:24-26` |
| `/categories` | POST | own category | ✅ | writes `userId`, `isSystem:false` | `categories/route.ts:48-54` |
| `/categories/[id]` | PATCH | own (non-system) | ⚠️ fetch-then-check | `findById` then `canManageCategory` | `categories/[categoryId]/route.ts:47-55` |
| `/categories/[id]` | DELETE | own (non-system) | ⚠️ fetch-then-check | `findById` then `canManageCategory` | `categories/[categoryId]/route.ts:108-116` |
| `/dashboard/summary` | GET | own data | ✅ | match scoped `userId` | `dashboard/summary/route.ts:24-25` |
| `/finance/aggregate` | GET | own data | ✅ | queries scoped `userId` | `finance/aggregate/route.ts:23-45` |
| `/analytics/summary` | GET | own data | ✅ | match scoped `userId` | `analytics/summary/route.ts:38-41` |
| `/me` | GET | own user | ✅ | `findById(userId)` | `me/route.ts:58` |
| `/me` | PATCH | own user | ✅ | `findByIdAndUpdate(userId)` | `me/route.ts:98` |
| `/groups` | GET | groups I'm in | ✅ | query `members.userId` | `groups/route.ts:66` |
| `/groups` | POST | new group | ✅ (n/a) | creates with self as owner | `groups/route.ts:124-135` |
| `/groups/join` | POST | join by code | ✅ (n/a) | adds self via invite code | `groups/join/route.ts:21-51` |
| `/groups/analytics` | GET | my groups | ✅ | query `members.userId` | `groups/analytics/route.ts:38` |
| `/groups/[id]` | GET | group I'm in | ⚠️ fetch-then-check | `findById` then `memberIds.includes(userId)` → 403 | `groups/[groupId]/route.ts:19-31` |
| `/groups/[id]/expenses` | GET | group I'm in | ⚠️ fetch-then-check | membership → 403 | `groups/[groupId]/expenses/route.ts:63-73` |
| `/groups/[id]/expenses` | POST | group I'm in | ⚠️ fetch-then-check | membership → 403; payers validated as members | `groups/[groupId]/expenses/route.ts:169-185` |
| `/groups/[id]/settlements` | GET | group I'm in | ⚠️ fetch-then-check | membership → 403 | `groups/[groupId]/settlements/route.ts:56-66` |
| `/groups/[id]/settlements` | POST | group I'm in | ⚠️ fetch-then-check | membership → 403; from/to validated as members | `groups/[groupId]/settlements/route.ts:181-195` |
| `/groups/[id]/balances` | GET | group I'm in | ⚠️ fetch-then-check | membership → 403 | `groups/[groupId]/balances/route.ts:64-73` |
| `/groups/[id]/analytics` | GET | group I'm in | ⚠️ fetch-then-check | membership → 403 | `groups/[groupId]/analytics/route.ts:36-46` |

## Findings

**The anticipated "no ownership check" defect does NOT exist.** Every private route performs an independent ownership/membership check in the handler. The middleware is not relied on for authorization. This contradicts the Phase 2 framing — I am reporting it rather than inventing a fix.

Real, smaller issues that Phase 2 (S1–S5) would still improve:

1. **Fetch-then-check (⚠️), not query-scoping.** All group routes and `categories/[id]` load the full document first, then assert membership/ownership in memory. This is correct but is exactly the "fetch-then-check" pattern S3 wants replaced with query-level scoping. Group routes cannot trivially scope by membership at the DB level without changing the "Group not found" vs "Forbidden" distinction (see next point).
2. **Enumerable IDs (403 vs 404).** Group routes return **403 Forbidden** when the user is not a member (`groups/[groupId]/*`), and `categories/[id]` returns **403**, which leaks the fact that the id exists. S4 wants 404 for inaccessible resources. Personal routes already correctly return 404 (they scope by `userId` so a foreign id is simply "not found").
3. **Duplicated guard logic.** The `findById → getGroupMemberIds → includes(userId) → 403` block is copy-pasted across six group routes with no shared helper — the S1 "single access guard" target.
4. **Input validation is mostly present but uneven.** Bodies are Zod-validated everywhere. Query strings are Zod-validated on list routes. **Path params (`groupId`, `transactionId`, …) are not schema-validated** — they are passed to `toObjectId`, which throws `"Invalid identifier"` → 422 for malformed ids. Functionally safe, but not the "validate path params with Zod / reject unknown keys" of S5. Zod objects do not set `.strict()`, so unknown body keys are silently stripped, not rejected.

## S6 — secrets sanity (preview)

- No secret is read on the client; all secret access is server-side via `lib/env.ts`.
- `.env.example` contains only placeholders (`replace-with-a-long-random-secret`, empty Google creds). ✅
- **`.env` is git-ignored and untracked** (`git check-ignore .env` matches; `git ls-files` lists only `.env.example`). ✅ No credential is committed.
- `invite-code.ts` uses `Math.random()` (not crypto-strong) — not a secret, but worth noting for group invite unguessability.
