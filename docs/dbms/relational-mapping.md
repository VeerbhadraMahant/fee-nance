> **Archived (MongoDB era, before October 2026).** This describes the design from when Fee-Nance ran on MongoDB. The runtime is now Supabase Postgres; the schema of record is `supabase/migrations/`, documented in [`docs/database.md`](../database.md). Kept as DBMS coursework history.

# Fee-Nance — Relational Mapping & Normalization

> **Academic context:** Fee-Nance uses MongoDB as its runtime database. This document provides the equivalent relational schema derived from the MongoDB data model, demonstrates normalization through 3NF, and documents index strategy — as required for DBMS mini-project deliverables.

---

## 1. Relational Schema (mapped from MongoDB collections)

### 1.1 USERS
| Column | Type | Constraints |
|---|---|---|
| `user_id` | CHAR(24) | PRIMARY KEY |
| `email` | VARCHAR(255) | UNIQUE NOT NULL |
| `name` | VARCHAR(100) | NOT NULL |
| `password_hash` | TEXT | NULL |
| `image` | TEXT | NULL |
| `google_id` | VARCHAR(255) | NULL |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |
| `updated_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |

---

### 1.2 CATEGORIES
| Column | Type | Constraints |
|---|---|---|
| `category_id` | CHAR(24) | PRIMARY KEY |
| `user_id` | CHAR(24) | FK → USERS(user_id), NULL (system categories have no owner) |
| `name` | VARCHAR(100) | NOT NULL |
| `type` | ENUM('income','expense') | NOT NULL |
| `icon` | VARCHAR(50) | NULL |
| `color` | VARCHAR(20) | NULL |
| `is_system` | BOOLEAN | NOT NULL DEFAULT FALSE |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |
| `updated_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |

> **Unique constraint:** `(user_id, name, type)` WHERE `user_id IS NOT NULL` (prevents duplicate custom category names per user per type).

---

### 1.3 TRANSACTIONS
| Column | Type | Constraints |
|---|---|---|
| `transaction_id` | CHAR(24) | PRIMARY KEY |
| `user_id` | CHAR(24) | FK → USERS(user_id) NOT NULL |
| `type` | ENUM('income','expense') | NOT NULL |
| `title` | VARCHAR(255) | NOT NULL |
| `notes` | TEXT | NULL |
| `amount` | DECIMAL(15,2) | NOT NULL CHECK(amount >= 0) |
| `currency` | CHAR(3) | NOT NULL DEFAULT 'INR' |
| `category_id` | CHAR(24) | FK → CATEGORIES(category_id), NULL |
| `transaction_date` | DATE | NOT NULL |
| `recurring_enabled` | BOOLEAN | NOT NULL DEFAULT FALSE |
| `recurring_frequency` | ENUM('monthly','yearly') | NULL |
| `recurring_next_run_at` | DATE | NULL |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |
| `updated_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |

> The `recurring_*` columns are a flattened representation of the embedded `recurring` sub-document in MongoDB. No separate table is needed because recurring config has no independent lifecycle — it is always read and written alongside the parent transaction.

---

### 1.4 BUDGETS
| Column | Type | Constraints |
|---|---|---|
| `budget_id` | CHAR(24) | PRIMARY KEY |
| `user_id` | CHAR(24) | FK → USERS(user_id) NOT NULL |
| `name` | VARCHAR(100) | NOT NULL |
| `amount` | DECIMAL(15,2) | NOT NULL CHECK(amount >= 0) |
| `currency` | CHAR(3) | NOT NULL DEFAULT 'INR' |
| `cycle` | ENUM('monthly','quarterly','yearly') | NOT NULL |
| `category_id` | CHAR(24) | FK → CATEGORIES(category_id), NULL |
| `period_start` | DATE | NOT NULL |
| `period_end` | DATE | NOT NULL |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |
| `updated_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |

---

### 1.5 GROUPS
| Column | Type | Constraints |
|---|---|---|
| `group_id` | CHAR(24) | PRIMARY KEY |
| `name` | VARCHAR(100) | NOT NULL |
| `created_by` | CHAR(24) | FK → USERS(user_id) NOT NULL |
| `invite_code` | VARCHAR(20) | UNIQUE NOT NULL |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |
| `updated_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |

---

### 1.6 GROUP_MEMBERS *(junction — normalized from `Group.members[]`)*
| Column | Type | Constraints |
|---|---|---|
| `group_id` | CHAR(24) | FK → GROUPS(group_id) NOT NULL |
| `user_id` | CHAR(24) | FK → USERS(user_id) NOT NULL |
| `role` | ENUM('owner','member') | NOT NULL DEFAULT 'member' |
| `joined_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |

> **PRIMARY KEY:** `(group_id, user_id)`  
> **Reason for separate table:** MongoDB embeds this as `Group.members[]`. In relational form it becomes a classic M:N junction between GROUPS and USERS.

---

### 1.7 GROUP_EXPENSES
| Column | Type | Constraints |
|---|---|---|
| `expense_id` | CHAR(24) | PRIMARY KEY |
| `group_id` | CHAR(24) | FK → GROUPS(group_id) NOT NULL |
| `created_by` | CHAR(24) | FK → USERS(user_id) NOT NULL |
| `title` | VARCHAR(255) | NOT NULL |
| `notes` | TEXT | NULL |
| `amount` | DECIMAL(15,2) | NOT NULL CHECK(amount >= 0) |
| `currency` | CHAR(3) | NOT NULL DEFAULT 'INR' |
| `split_type` | ENUM('equal','custom','percentage') | NOT NULL |
| `incurred_at` | TIMESTAMP | NOT NULL |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |
| `updated_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |

---

### 1.8 EXPENSE_PAYERS *(normalized from `GroupExpense.paidBy[]`)*
| Column | Type | Constraints |
|---|---|---|
| `expense_id` | CHAR(24) | FK → GROUP_EXPENSES(expense_id) NOT NULL |
| `user_id` | CHAR(24) | FK → USERS(user_id) NOT NULL |
| `amount` | DECIMAL(15,2) | NOT NULL CHECK(amount >= 0) |

> **PRIMARY KEY:** `(expense_id, user_id)`

---

### 1.9 EXPENSE_SPLITS *(normalized from `GroupExpense.splits[]`)*
| Column | Type | Constraints |
|---|---|---|
| `expense_id` | CHAR(24) | FK → GROUP_EXPENSES(expense_id) NOT NULL |
| `user_id` | CHAR(24) | FK → USERS(user_id) NOT NULL |
| `amount` | DECIMAL(15,2) | NULL — set when split_type = 'custom' |
| `percentage` | DECIMAL(5,2) | NULL — set when split_type = 'percentage' |
| `share_amount` | DECIMAL(15,2) | NOT NULL — resolved final INR share |

> **PRIMARY KEY:** `(expense_id, user_id)`

---

### 1.10 SETTLEMENTS
| Column | Type | Constraints |
|---|---|---|
| `settlement_id` | CHAR(24) | PRIMARY KEY |
| `group_id` | CHAR(24) | FK → GROUPS(group_id) NOT NULL |
| `from_user_id` | CHAR(24) | FK → USERS(user_id) NOT NULL |
| `to_user_id` | CHAR(24) | FK → USERS(user_id) NOT NULL |
| `amount` | DECIMAL(15,2) | NOT NULL CHECK(amount >= 0) |
| `currency` | CHAR(3) | NOT NULL DEFAULT 'INR' |
| `note` | TEXT | NULL |
| `settled_at` | TIMESTAMP | NOT NULL |
| `created_by` | CHAR(24) | FK → USERS(user_id) NOT NULL |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |
| `updated_at` | TIMESTAMP | NOT NULL DEFAULT NOW() |

---

## 2. Normalization Proof

### First Normal Form (1NF)

**Rule:** Every column contains atomic (indivisible) values; no repeating groups.

| Table | MongoDB source | 1NF action |
|---|---|---|
| TRANSACTIONS | `recurring` is a sub-doc with 3 nested fields | Flattened to 3 atomic columns (`recurring_enabled`, `recurring_frequency`, `recurring_next_run_at`) |
| GROUP_MEMBERS | `Group.members[]` is a repeated array | Extracted into separate `GROUP_MEMBERS` table — each row = one (group, user) pair |
| EXPENSE_PAYERS | `GroupExpense.paidBy[]` is a repeated array | Extracted into separate `EXPENSE_PAYERS` table |
| EXPENSE_SPLITS | `GroupExpense.splits[]` is a repeated array | Extracted into separate `EXPENSE_SPLITS` table |

All other tables already contain only flat, atomic values. **All tables satisfy 1NF. ✓**

---

### Second Normal Form (2NF)

**Rule:** The table is in 1NF AND every non-key column depends on the *entire* primary key (no partial dependencies). Partial dependencies can only arise in tables with composite PKs.

Tables with composite PKs: `GROUP_MEMBERS`, `EXPENSE_PAYERS`, `EXPENSE_SPLITS`.

**GROUP_MEMBERS** — PK: `(group_id, user_id)`
- `role` → depends on (group_id, user_id): a user's role is specific to a particular group ✓
- `joined_at` → depends on (group_id, user_id): the join timestamp is specific to that group-user pair ✓
- No partial dependency. **2NF ✓**

**EXPENSE_PAYERS** — PK: `(expense_id, user_id)`
- `amount` → how much this user paid for *this expense* — depends on full PK ✓
- No partial dependency. **2NF ✓**

**EXPENSE_SPLITS** — PK: `(expense_id, user_id)`
- `amount`, `percentage`, `share_amount` → all describe this user's share of *this expense* — depend on full PK ✓
- No partial dependency. **2NF ✓**

All single-column PK tables trivially satisfy 2NF. **All tables satisfy 2NF. ✓**

---

### Third Normal Form (3NF)

**Rule:** The table is in 2NF AND every non-key column depends *directly on the primary key only* — no transitive dependencies (non-key → non-key → PK is not allowed).

**USERS**
- `email`, `name`, `password_hash`, `image`, `google_id`, `created_at`, `updated_at` — all depend directly on `user_id`.
- `google_id` could be a candidate key, but `google_id → user_id` is a functional dependency between a candidate key and the PK, which is permitted in 3NF.
- **No transitive dependencies. 3NF ✓**

**CATEGORIES**
- All attributes depend directly on `category_id`.
- `user_id` is a FK, not a determinant of any other non-key column.
- **3NF ✓**

**TRANSACTIONS**
- All attributes depend directly on `transaction_id`.
- `recurring_frequency` and `recurring_next_run_at` depend only on `transaction_id`, not on `recurring_enabled` (they are nullable and represent independent optional data).
- **3NF ✓**

**BUDGETS**
- All attributes depend directly on `budget_id`.
- `period_end` might appear to depend on `(period_start, cycle)` — but per design, both are stored explicitly and either can be overridden, so no transitive dependency.
- **3NF ✓**

**GROUPS**
- `invite_code` is a candidate key; `invite_code → group_id` is allowed.
- All other columns depend directly on `group_id`.
- **3NF ✓**

**GROUP_MEMBERS**
- `role` and `joined_at` depend on `(group_id, user_id)` with no intermediate non-key step.
- **3NF ✓**

**GROUP_EXPENSES**
- All columns depend directly on `expense_id`.
- **3NF ✓**

**EXPENSE_PAYERS**
- `amount` depends on `(expense_id, user_id)`.
- **3NF ✓**

**EXPENSE_SPLITS**
- `amount`, `percentage`, `share_amount` all depend on `(expense_id, user_id)`.
- Note: `share_amount` could in theory be derived from `amount`/`percentage` + expense total, but it is *stored* as a resolved value (denormalized by design) to avoid expensive recomputation at read time. This is a controlled denormalization, documented here.
- **3NF ✓**

**SETTLEMENTS**
- All columns depend directly on `settlement_id`.
- **3NF ✓**

> **All 10 relational tables are in Third Normal Form (3NF).**

---

## 3. Index Strategy

### USERS
| Index | Type | Purpose |
|---|---|---|
| `email` | Unique | Auth lookup by email |
| `google_id` | Sparse | OAuth login lookup |

### CATEGORIES
| Index | Type | Purpose |
|---|---|---|
| `user_id` | Single | List user's custom categories |
| `type` | Single | Filter categories by income/expense |
| `(user_id, name, type)` | Unique Sparse | Prevent duplicate custom category names |
| `is_system` | Single | Fetch all system categories |

### TRANSACTIONS
| Index | Type | Purpose |
|---|---|---|
| `user_id` | Single | Base filter for all user queries |
| `type` | Single | Filter by income/expense |
| `categoryId` | Single | Category-wise lookup |
| `transactionDate` | Single | Date range filtering |
| `(userId, transactionDate DESC)` | Compound | Paginated transaction list by date |
| `(userId, type, transactionDate DESC)` | Compound | Income/expense monthly summary |
| `(userId, categoryId, transactionDate DESC)` | Compound | Category-wise aggregation |

### BUDGETS
| Index | Type | Purpose |
|---|---|---|
| `userId` | Single | List user budgets |
| `cycle` | Single | Filter by budget cycle |
| `categoryId` | Single | Category-scoped budget lookup |
| `(userId, cycle, periodStart)` | Compound | Active budget for a given period |

### GROUPS
| Index | Type | Purpose |
|---|---|---|
| `createdBy` | Single | Groups created by user |
| `inviteCode` | Unique | Join group by code |
| `members.userId` | Single | Find all groups for a user |

### GROUP_EXPENSES
| Index | Type | Purpose |
|---|---|---|
| `groupId` | Single | All expenses in a group |
| `createdBy` | Single | Expenses created by user |
| `splitType` | Single | Filter by split type |
| `incurredAt` | Single | Date-based filtering |
| `(groupId, incurredAt DESC)` | Compound | Paginated group expense history |

### SETTLEMENTS
| Index | Type | Purpose |
|---|---|---|
| `groupId` | Single | All settlements in a group |
| `fromUserId` | Single | Settlements paid by user |
| `toUserId` | Single | Settlements received by user |
| `settledAt` | Single | Date-based filtering |
| `createdBy` | Single | Settlements recorded by user |
| `(groupId, settledAt DESC)` | Compound | Paginated settlement history |

---

## 4. Key Design Decisions

| Decision | Rationale |
|---|---|
| MongoDB over relational DB | Embedded arrays (paidBy, splits, members) reduce joins for the most frequent reads; document model matches object graph naturally |
| `recurring` embedded in Transaction | Recurring config has no lifecycle independent of its transaction; embedding avoids an extra collection and join |
| `share_amount` stored (not computed) | Avoids expensive re-derivation; split is validated and finalized at write time |
| System categories (`userId = null`) | Single source of truth for default categories; shared across all users without duplication |
| INR-only currency | MVP scope constraint; simplifies amount arithmetic and UI |
| Invite codes for group join | Avoids email-based invite flow complexity; stateless and self-contained |
