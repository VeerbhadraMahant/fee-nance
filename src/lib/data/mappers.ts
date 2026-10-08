/**
 * Postgres rows → the JSON shapes the frontend already consumes.
 *
 * The API contract predates the move off MongoDB: ids are `_id`, fields are
 * camelCase, and nested group data looks like Mongoose's populated documents.
 * Keeping that contract here means no client component had to change when
 * the storage engine did. numeric columns are coerced with Number() because
 * PostgREST may return them as strings for very large values.
 */

const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));
const opt = <T>(value: T | null | undefined) => (value === null ? undefined : value);

export interface TransactionRow {
  id: string;
  user_id: string;
  type: "income" | "expense";
  title: string;
  notes: string | null;
  amount: number | string;
  currency: string;
  category_id: string | null;
  transaction_date: string;
  recurring_enabled: boolean;
  recurring_frequency: "monthly" | "yearly" | null;
  recurring_next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export function toTransaction(row: TransactionRow) {
  return {
    _id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    notes: opt(row.notes),
    amount: num(row.amount),
    currency: row.currency,
    categoryId: opt(row.category_id),
    transactionDate: row.transaction_date,
    recurring: {
      enabled: row.recurring_enabled,
      frequency: opt(row.recurring_frequency),
      nextRunAt: opt(row.recurring_next_run_at),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CategoryRow {
  id: string;
  user_id: string | null;
  name: string;
  type: "income" | "expense";
  icon: string | null;
  color: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export function toCategory(row: CategoryRow) {
  return {
    _id: row.id,
    userId: opt(row.user_id),
    name: row.name,
    type: row.type,
    icon: opt(row.icon),
    color: opt(row.color),
    isSystem: row.is_system,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface BudgetRow {
  id: string;
  user_id: string;
  name: string;
  amount: number | string;
  currency: string;
  cycle: "monthly" | "quarterly" | "yearly";
  category_id: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
  updated_at: string;
}

export function toBudget(row: BudgetRow) {
  return {
    _id: row.id,
    userId: row.user_id,
    name: row.name,
    amount: num(row.amount),
    currency: row.currency,
    cycle: row.cycle,
    categoryId: opt(row.category_id),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface GoalRow {
  id: string;
  user_id: string;
  name: string;
  theme: string;
  target_amount: number | string;
  saved_amount: number | string;
  currency: string;
  target_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function toGoal(row: GoalRow) {
  return {
    _id: row.id,
    userId: row.user_id,
    name: row.name,
    theme: row.theme,
    targetAmount: num(row.target_amount),
    savedAmount: num(row.saved_amount),
    currency: row.currency,
    targetDate: row.target_date,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ProfileRef {
  id: string;
  name: string;
  email: string;
}

export interface GroupRow {
  id: string;
  name: string;
  created_by: string;
  invite_code: string;
  created_at: string;
  updated_at: string;
  group_members?: Array<{
    user_id: string;
    role: "owner" | "member";
    joined_at: string;
    profiles: ProfileRef | null;
  }>;
}

/** Members come back "populated", as the UI expects: userId is an object. */
export function toGroup(row: GroupRow) {
  return {
    _id: row.id,
    name: row.name,
    createdBy: row.created_by,
    inviteCode: row.invite_code,
    members: (row.group_members ?? [])
      .slice()
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at))
      .map((member) => ({
        userId: {
          _id: member.user_id,
          name: member.profiles?.name ?? "Former member",
          email: member.profiles?.email ?? "",
        },
        role: member.role,
        joinedAt: member.joined_at,
      })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The select string that produces a GroupRow with populated members. */
export const GROUP_SELECT =
  "id, name, created_by, invite_code, created_at, updated_at, group_members(user_id, role, joined_at, profiles(id, name, email))";

export interface GroupExpenseRow {
  id: string;
  group_id: string;
  created_by: string;
  title: string;
  notes: string | null;
  amount: number | string;
  currency: string;
  split_type: "equal" | "custom" | "percentage" | "itemized";
  line_items: Array<{
    _id?: string;
    label: string;
    amount: number;
    sharedBy: string[];
    proportional?: boolean;
  }>;
  extraction: { source: string; confidence?: number; extractedAt: string } | null;
  incurred_at: string;
  created_at: string;
  updated_at: string;
  group_expense_payers?: Array<{ user_id: string; amount: number | string }>;
  group_expense_splits?: Array<{
    user_id: string;
    amount: number | string | null;
    percentage: number | string | null;
    share_amount: number | string;
  }>;
}

export const GROUP_EXPENSE_SELECT =
  "*, group_expense_payers(user_id, amount), group_expense_splits(user_id, amount, percentage, share_amount)";

export function toGroupExpense(row: GroupExpenseRow) {
  return {
    _id: row.id,
    groupId: row.group_id,
    createdBy: row.created_by,
    title: row.title,
    notes: opt(row.notes),
    amount: num(row.amount),
    currency: row.currency,
    splitType: row.split_type,
    paidBy: (row.group_expense_payers ?? []).map((payer) => ({
      userId: payer.user_id,
      amount: num(payer.amount),
    })),
    splits: (row.group_expense_splits ?? []).map((split) => ({
      userId: split.user_id,
      amount: split.amount === null ? undefined : num(split.amount),
      percentage: split.percentage === null ? undefined : num(split.percentage),
      shareAmount: num(split.share_amount),
    })),
    lineItems: row.line_items ?? [],
    extraction: row.extraction ?? undefined,
    incurredAt: row.incurred_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface SettlementRow {
  id: string;
  group_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number | string;
  currency: string;
  note: string | null;
  settled_at: string;
  created_by: string;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export function toSettlement(row: SettlementRow) {
  return {
    _id: row.id,
    groupId: row.group_id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    amount: num(row.amount),
    currency: row.currency,
    note: opt(row.note),
    settledAt: row.settled_at,
    createdBy: row.created_by,
    idempotencyKey: opt(row.idempotency_key),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export { num };
