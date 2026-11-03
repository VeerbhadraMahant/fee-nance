-- Trigger / Procedure / Function / Cursor Equivalents (Documentation-Only)

-- FUNCTION EQUIVALENT
-- In relational systems, a function might validate split totals.
-- In Fee-Nance Mongo runtime, this is implemented in backend TypeScript logic:
--   src/lib/split.ts
--   - validatePayers(totalAmount, payers)
--   - computeShares(totalAmount, splitType, splits, memberIds)

-- PROCEDURE EQUIVALENT
-- In relational systems, a stored procedure might post settlement and update balances.
-- In Fee-Nance Mongo runtime, this is implemented in:
--   src/app/api/private/groups/[groupId]/settlements/route.ts
--   with idempotency protection and validation rules.

-- TRIGGER EQUIVALENT
-- In relational systems, AFTER INSERT trigger could enforce denormalized summaries.
-- In Fee-Nance Mongo runtime, derived data is computed on-demand via:
--   src/app/api/private/dashboard/summary/route.ts
--   src/app/api/private/groups/[groupId]/balances/route.ts
-- This avoids stale summary tables.

-- CURSOR EQUIVALENT
-- In relational systems, cursor can iterate rows for running balances.
-- In Fee-Nance Mongo runtime, controlled iteration is done in backend loops:
--   - simplifyPairwise(balanceMap) in group balances route
--   - transaction reduction logic in dashboard/finance summaries

-- Optional relational pseudo-procedure example (documentation only):
-- CREATE PROCEDURE post_settlement(IN p_group_id CHAR(24), IN p_from_user CHAR(24), IN p_to_user CHAR(24), IN p_amount DECIMAL(15,2))
-- BEGIN
--   INSERT INTO settlements(group_id, from_user_id, to_user_id, amount, created_by, settled_at)
--   VALUES (p_group_id, p_from_user, p_to_user, p_amount, p_from_user, CURRENT_TIMESTAMP);
-- END;
