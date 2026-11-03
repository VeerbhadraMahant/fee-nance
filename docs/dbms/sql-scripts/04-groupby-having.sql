-- GROUP BY and HAVING (Documentation-Only)
-- Reporting style equivalents of Mongo aggregation outputs.

-- 1) Category-wise expense summary per user
SELECT
  t.user_id,
  c.name AS category_name,
  SUM(t.amount) AS total_expense
FROM transactions t
LEFT JOIN categories c ON c.category_id = t.category_id
WHERE t.type = 'expense'
GROUP BY t.user_id, c.name
ORDER BY t.user_id, total_expense DESC;

-- 2) Monthly income/expense trend per user
SELECT
  t.user_id,
  EXTRACT(YEAR FROM t.transaction_date) AS year,
  EXTRACT(MONTH FROM t.transaction_date) AS month,
  SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) AS income_total,
  SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) AS expense_total
FROM transactions t
GROUP BY t.user_id, EXTRACT(YEAR FROM t.transaction_date), EXTRACT(MONTH FROM t.transaction_date)
ORDER BY t.user_id, year, month;

-- 3) HAVING: members with spend above threshold in selected month
SELECT
  t.user_id,
  SUM(t.amount) AS monthly_expense
FROM transactions t
WHERE t.type = 'expense'
  AND DATE_TRUNC('month', t.transaction_date) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY t.user_id
HAVING SUM(t.amount) >= 10000
ORDER BY monthly_expense DESC;

-- 4) HAVING: groups with total settlements above threshold
SELECT
  s.group_id,
  SUM(s.amount) AS settlement_total
FROM settlements s
GROUP BY s.group_id
HAVING SUM(s.amount) > 500
ORDER BY settlement_total DESC;
