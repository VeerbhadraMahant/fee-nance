-- Fee-Nance DML Mapping (Documentation-Only)
-- Sample records aligned with the Mongo seed scenario.

-- Users
INSERT INTO users (user_id, email, name, password_hash)
VALUES
  ('u_alex_demo_000000000001', 'alex@feenance.demo', 'Alex Demo', '<bcrypt-hash>'),
  ('u_riya_demo_000000000002', 'riya@feenance.demo', 'Riya Demo', '<bcrypt-hash>'),
  ('u_kabir_demo_00000000003', 'kabir@feenance.demo', 'Kabir Demo', '<bcrypt-hash>');

-- System categories
INSERT INTO categories (category_id, user_id, name, type, icon, color, is_system)
VALUES
  ('c_salary_000000000000001', NULL, 'Salary', 'income', 'wallet', '#7F77DD', TRUE),
  ('c_food_00000000000000002', NULL, 'Food', 'expense', 'utensils', '#7F77DD', TRUE),
  ('c_rent_00000000000000003', NULL, 'Rent', 'expense', 'home', '#7F77DD', TRUE),
  ('c_travel_000000000000004', NULL, 'Travel', 'expense', 'car', '#7F77DD', TRUE);

-- One sample group and members
INSERT INTO groups (group_id, name, created_by, invite_code)
VALUES ('g_weekend_crew_0000001', 'Weekend Crew', 'u_alex_demo_000000000001', 'AB12CD34');

INSERT INTO group_members (group_id, user_id, role)
VALUES
  ('g_weekend_crew_0000001', 'u_alex_demo_000000000001', 'owner'),
  ('g_weekend_crew_0000001', 'u_riya_demo_000000000002', 'member'),
  ('g_weekend_crew_0000001', 'u_kabir_demo_00000000003', 'member');

-- One group expense with payers and splits
INSERT INTO group_expenses (expense_id, group_id, created_by, title, amount, split_type, incurred_at)
VALUES ('e_dinner_000000000001', 'g_weekend_crew_0000001', 'u_alex_demo_000000000001', 'Dinner Out', 3600, 'equal', CURRENT_TIMESTAMP);

INSERT INTO expense_payers (expense_id, user_id, amount)
VALUES
  ('e_dinner_000000000001', 'u_alex_demo_000000000001', 3000),
  ('e_dinner_000000000001', 'u_riya_demo_000000000002', 600);

INSERT INTO expense_splits (expense_id, user_id, share_amount)
VALUES
  ('e_dinner_000000000001', 'u_alex_demo_000000000001', 1200),
  ('e_dinner_000000000001', 'u_riya_demo_000000000002', 1200),
  ('e_dinner_000000000001', 'u_kabir_demo_00000000003', 1200);

-- One settlement
INSERT INTO settlements (
  settlement_id,
  group_id,
  from_user_id,
  to_user_id,
  amount,
  created_by,
  settled_at,
  idempotency_key
)
VALUES (
  's_weekend_000000000001',
  'g_weekend_crew_0000001',
  'u_kabir_demo_00000000003',
  'u_alex_demo_000000000001',
  900,
  'u_kabir_demo_00000000003',
  CURRENT_TIMESTAMP,
  'weekend-settle-001'
);
