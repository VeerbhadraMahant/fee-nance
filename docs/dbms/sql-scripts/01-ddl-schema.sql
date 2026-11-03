-- Fee-Nance DDL Mapping (Documentation-Only)
-- Runtime DB is MongoDB; this file is for DBMS submission mapping.

CREATE TABLE users (
  user_id CHAR(24) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  password_hash TEXT NULL,
  image TEXT NULL,
  google_id VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  category_id CHAR(24) PRIMARY KEY,
  user_id CHAR(24) NULL,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense')),
  icon VARCHAR(50) NULL,
  color VARCHAR(20) NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_categories_user FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE UNIQUE INDEX uq_categories_user_name_type
  ON categories(user_id, name, type)
  WHERE user_id IS NOT NULL;

CREATE TABLE transactions (
  transaction_id CHAR(24) PRIMARY KEY,
  user_id CHAR(24) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense')),
  title VARCHAR(255) NOT NULL,
  notes TEXT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  category_id CHAR(24) NULL,
  transaction_date DATE NOT NULL,
  recurring_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_frequency VARCHAR(20) NULL CHECK (recurring_frequency IN ('monthly', 'yearly')),
  recurring_next_run_at DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_transactions_category FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

CREATE INDEX ix_transactions_user_date ON transactions(user_id, transaction_date DESC);
CREATE INDEX ix_transactions_user_type_date ON transactions(user_id, type, transaction_date DESC);
CREATE INDEX ix_transactions_user_category_date ON transactions(user_id, category_id, transaction_date DESC);

CREATE TABLE budgets (
  budget_id CHAR(24) PRIMARY KEY,
  user_id CHAR(24) NOT NULL,
  name VARCHAR(100) NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  cycle VARCHAR(20) NOT NULL CHECK (cycle IN ('monthly', 'quarterly', 'yearly')),
  category_id CHAR(24) NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_budgets_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_budgets_category FOREIGN KEY (category_id) REFERENCES categories(category_id)
);

CREATE TABLE groups (
  group_id CHAR(24) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_by CHAR(24) NOT NULL,
  invite_code VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_groups_user FOREIGN KEY (created_by) REFERENCES users(user_id)
);

CREATE TABLE group_members (
  group_id CHAR(24) NOT NULL,
  user_id CHAR(24) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  CONSTRAINT fk_group_members_group FOREIGN KEY (group_id) REFERENCES groups(group_id),
  CONSTRAINT fk_group_members_user FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE group_expenses (
  expense_id CHAR(24) PRIMARY KEY,
  group_id CHAR(24) NOT NULL,
  created_by CHAR(24) NOT NULL,
  title VARCHAR(255) NOT NULL,
  notes TEXT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  split_type VARCHAR(20) NOT NULL CHECK (split_type IN ('equal', 'custom', 'percentage')),
  incurred_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_group_expenses_group FOREIGN KEY (group_id) REFERENCES groups(group_id),
  CONSTRAINT fk_group_expenses_user FOREIGN KEY (created_by) REFERENCES users(user_id)
);

CREATE TABLE expense_payers (
  expense_id CHAR(24) NOT NULL,
  user_id CHAR(24) NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (expense_id, user_id),
  CONSTRAINT fk_expense_payers_expense FOREIGN KEY (expense_id) REFERENCES group_expenses(expense_id),
  CONSTRAINT fk_expense_payers_user FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE expense_splits (
  expense_id CHAR(24) NOT NULL,
  user_id CHAR(24) NOT NULL,
  amount DECIMAL(15,2) NULL,
  percentage DECIMAL(5,2) NULL,
  share_amount DECIMAL(15,2) NOT NULL CHECK (share_amount >= 0),
  PRIMARY KEY (expense_id, user_id),
  CONSTRAINT fk_expense_splits_expense FOREIGN KEY (expense_id) REFERENCES group_expenses(expense_id),
  CONSTRAINT fk_expense_splits_user FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE settlements (
  settlement_id CHAR(24) PRIMARY KEY,
  group_id CHAR(24) NOT NULL,
  from_user_id CHAR(24) NOT NULL,
  to_user_id CHAR(24) NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  note TEXT NULL,
  settled_at TIMESTAMP NOT NULL,
  created_by CHAR(24) NOT NULL,
  idempotency_key VARCHAR(128) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_settlements_group FOREIGN KEY (group_id) REFERENCES groups(group_id),
  CONSTRAINT fk_settlements_from_user FOREIGN KEY (from_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_settlements_to_user FOREIGN KEY (to_user_id) REFERENCES users(user_id),
  CONSTRAINT fk_settlements_created_by FOREIGN KEY (created_by) REFERENCES users(user_id)
);

CREATE UNIQUE INDEX uq_settlement_idempotency
  ON settlements(group_id, created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
