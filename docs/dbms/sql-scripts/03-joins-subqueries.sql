-- Joins and Subqueries (Documentation-Only)
-- Relational equivalents of MongoDB aggregate pipelines and backend logic.

-- 1) JOIN: Group membership roster with user details
SELECT
  g.group_id,
  g.name AS group_name,
  u.user_id,
  u.name AS member_name,
  gm.role,
  gm.joined_at
FROM groups g
JOIN group_members gm ON gm.group_id = g.group_id
JOIN users u ON u.user_id = gm.user_id
WHERE g.group_id = 'g_weekend_crew_0000001'
ORDER BY gm.joined_at ASC;

-- 2) JOIN: Expense details with who paid and who owes
SELECT
  ge.expense_id,
  ge.title,
  ge.amount,
  payer_user.name AS payer_name,
  ep.amount AS payer_amount,
  split_user.name AS split_member_name,
  es.share_amount
FROM group_expenses ge
JOIN expense_payers ep ON ep.expense_id = ge.expense_id
JOIN users payer_user ON payer_user.user_id = ep.user_id
JOIN expense_splits es ON es.expense_id = ge.expense_id
JOIN users split_user ON split_user.user_id = es.user_id
WHERE ge.expense_id = 'e_dinner_000000000001'
ORDER BY payer_user.name, split_user.name;

-- 3) Subquery: users whose monthly spend is above average monthly spend
SELECT monthly.user_id, monthly.total_expense
FROM (
  SELECT t.user_id, SUM(t.amount) AS total_expense
  FROM transactions t
  WHERE t.type = 'expense'
    AND DATE_TRUNC('month', t.transaction_date) = DATE_TRUNC('month', CURRENT_DATE)
  GROUP BY t.user_id
) monthly
WHERE monthly.total_expense > (
  SELECT AVG(inner_monthly.total_expense)
  FROM (
    SELECT SUM(t2.amount) AS total_expense
    FROM transactions t2
    WHERE t2.type = 'expense'
      AND DATE_TRUNC('month', t2.transaction_date) = DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY t2.user_id
  ) inner_monthly
);

-- 4) Correlated subquery: top expense transaction per user
SELECT t.user_id, t.transaction_id, t.title, t.amount
FROM transactions t
WHERE t.type = 'expense'
  AND t.amount = (
    SELECT MAX(t2.amount)
    FROM transactions t2
    WHERE t2.user_id = t.user_id
      AND t2.type = 'expense'
  )
ORDER BY t.user_id;
