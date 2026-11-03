> **Archived (MongoDB era, before October 2026).** This describes the design from when Fee-Nance ran on MongoDB. The runtime is now Supabase Postgres; the schema of record is `supabase/migrations/`, documented in [`docs/database.md`](../database.md). Kept as DBMS coursework history.

# Fee-Nance — Entity-Relationship Diagram

## Entities and Relationships

```mermaid
erDiagram
    USER {
        ObjectId _id PK
        string   email         "unique, indexed"
        string   name
        string   passwordHash  "nullable"
        string   image         "nullable"
        string   googleId      "nullable, indexed"
        date     createdAt
        date     updatedAt
    }

    CATEGORY {
        ObjectId _id PK
        ObjectId userId        FK "nullable — null = system category"
        string   name
        string   type          "enum: income | expense"
        string   icon          "nullable"
        string   color         "nullable"
        boolean  isSystem
        date     createdAt
        date     updatedAt
    }

    TRANSACTION {
        ObjectId _id PK
        ObjectId userId        FK
        string   type          "enum: income | expense"
        string   title
        string   notes         "nullable"
        number   amount        "min: 0"
        string   currency      "default: INR"
        ObjectId categoryId    FK "nullable"
        date     transactionDate
        boolean  recurringEnabled
        string   recurringFrequency "enum: monthly | yearly | null"
        date     recurringNextRunAt "nullable"
        date     createdAt
        date     updatedAt
    }

    BUDGET {
        ObjectId _id PK
        ObjectId userId        FK
        string   name
        number   amount        "min: 0"
        string   currency      "default: INR"
        string   cycle         "enum: monthly | quarterly | yearly"
        ObjectId categoryId    FK "nullable"
        date     periodStart
        date     periodEnd
        date     createdAt
        date     updatedAt
    }

    GROUP {
        ObjectId _id PK
        string   name
        ObjectId createdBy     FK
        string   inviteCode    "unique, indexed"
        date     createdAt
        date     updatedAt
    }

    GROUP_MEMBER {
        ObjectId groupId       FK
        ObjectId userId        FK
        string   role          "enum: owner | member"
        date     joinedAt
    }

    GROUP_EXPENSE {
        ObjectId _id PK
        ObjectId groupId       FK
        ObjectId createdBy     FK
        string   title
        string   notes         "nullable"
        number   amount        "min: 0"
        string   currency      "default: INR"
        string   splitType     "enum: equal | custom | percentage"
        date     incurredAt
        date     createdAt
        date     updatedAt
    }

    EXPENSE_PAYER {
        ObjectId expenseId     FK
        ObjectId userId        FK
        number   amount        "min: 0"
    }

    EXPENSE_SPLIT {
        ObjectId expenseId     FK
        ObjectId userId        FK
        number   amount        "nullable — used in custom split"
        number   percentage    "nullable — used in percentage split"
        number   shareAmount   "resolved final amount, min: 0"
    }

    SETTLEMENT {
        ObjectId _id PK
        ObjectId groupId       FK
        ObjectId fromUserId    FK
        ObjectId toUserId      FK
        number   amount        "min: 0"
        string   currency      "default: INR"
        string   note          "nullable"
        date     settledAt
        ObjectId createdBy     FK
        date     createdAt
        date     updatedAt
    }

    %% ── Personal Finance Relationships ─────────────────────────
    USER         ||--o{ TRANSACTION   : "owns"
    USER         ||--o{ CATEGORY      : "owns (custom)"
    USER         ||--o{ BUDGET        : "owns"
    CATEGORY     ||--o{ TRANSACTION   : "classifies"
    CATEGORY     ||--o{ BUDGET        : "scopes"

    %% ── Group Relationships ──────────────────────────────────────
    USER         ||--o{ GROUP         : "creates"
    GROUP        ||--o{ GROUP_MEMBER  : "has"
    USER         ||--o{ GROUP_MEMBER  : "participates in"
    GROUP        ||--o{ GROUP_EXPENSE : "contains"
    USER         ||--o{ GROUP_EXPENSE : "creates"
    GROUP_EXPENSE ||--o{ EXPENSE_PAYER : "paid by"
    GROUP_EXPENSE ||--o{ EXPENSE_SPLIT : "split across"
    USER         ||--o{ EXPENSE_PAYER  : "pays"
    USER         ||--o{ EXPENSE_SPLIT  : "owes share"
    GROUP        ||--o{ SETTLEMENT     : "settles within"
    USER         ||--o{ SETTLEMENT     : "pays (from)"
    USER         ||--o{ SETTLEMENT     : "receives (to)"
```

## Embedded vs Relational Notes

| MongoDB Embedding | Relational Equivalent | Rationale |
|---|---|---|
| `Transaction.recurring` (sub-doc) | Flattened columns on `TRANSACTION` | Always accessed together; no independent lifecycle |
| `Group.members[]` (array of sub-docs) | Separate `GROUP_MEMBER` junction table | Small bounded set; queried via `$elemMatch` on groupId |
| `GroupExpense.paidBy[]` | Separate `EXPENSE_PAYER` junction table | Bounded to group members; queried only via parent expense |
| `GroupExpense.splits[]` | Separate `EXPENSE_SPLIT` junction table | Bounded to group members; computed at write time |
