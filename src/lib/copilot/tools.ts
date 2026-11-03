/**
 * Tools the copilot can call. Every one runs through the caller's own
 * Supabase client, so row-level security scopes the data to them — the model
 * can never see or touch anyone else's ledger — and nothing here writes.
 * `draft_transaction` only proposes an entry; the user saves it from the UI
 * through the ordinary transactions route, validated like any other.
 */

import { spendByBudget } from "@/lib/budget-spend";
import { computeHealthScore } from "@/lib/health-score";
import { averageSurplus, completedMonthTotals } from "@/lib/ledger-stats";
import { roundCurrency } from "@/lib/money";
import { must } from "@/lib/route";
import type { SupabaseServerClient } from "@/lib/supabase/server";

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters?: {
    type: "OBJECT";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

const RANGE_PROPS = {
  startDate: { type: "STRING", description: "ISO date (YYYY-MM-DD), inclusive start. Optional." },
  endDate: { type: "STRING", description: "ISO date (YYYY-MM-DD), inclusive end. Optional." },
};

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: "get_financial_snapshot",
    description:
      "Overall picture: current balance, last 6 completed months of income/expense, average monthly surplus and the 0-100 financial health score with its five sub-scores. Call this first for broad questions.",
  },
  {
    name: "get_spending_by_category",
    description: "Totals per category for a date range and type. Defaults to expenses over the last 90 days.",
    parameters: {
      type: "OBJECT",
      properties: { ...RANGE_PROPS, type: { type: "STRING", description: "income or expense", enum: ["income", "expense"] } },
    },
  },
  {
    name: "get_monthly_trend",
    description: "Income and expense per calendar month over a range. Defaults to the last 12 months.",
    parameters: { type: "OBJECT", properties: RANGE_PROPS },
  },
  {
    name: "search_transactions",
    description:
      "List individual transactions, newest first (max 50). Filter by type, text in the title, date range, or amount range.",
    parameters: {
      type: "OBJECT",
      properties: {
        ...RANGE_PROPS,
        type: { type: "STRING", description: "income or expense", enum: ["income", "expense"] },
        query: { type: "STRING", description: "Substring to match in the transaction title." },
        minAmount: { type: "NUMBER", description: "Minimum amount in rupees." },
        maxAmount: { type: "NUMBER", description: "Maximum amount in rupees." },
        sortBy: { type: "STRING", description: "date (default) or amount (largest first)", enum: ["date", "amount"] },
        limit: { type: "NUMBER", description: "Rows to return, default 20, max 50." },
      },
    },
  },
  {
    name: "get_budgets",
    description: "Budgets whose period includes today, with amount spent, remaining and percent used.",
  },
  {
    name: "get_goals",
    description: "Savings goals with progress, target date, and months to finish at the user's current monthly surplus.",
  },
  {
    name: "get_recurring_rules",
    description: "Active recurring income and expense rules (subscriptions, rent, salary) with next run date.",
  },
  {
    name: "get_unusual_activity",
    description: "Outlier spends, possible duplicate charges and category spending drift detected in the ledger.",
    parameters: { type: "OBJECT", properties: RANGE_PROPS },
  },
  {
    name: "get_group_balances",
    description:
      "The user's shared-expense groups: each group's members, every member's net position (positive = the group owes them), and the user's own net. Use for 'who owes me', 'what do I owe', settling up.",
  },
  {
    name: "draft_transaction",
    description:
      "Propose ONE personal income or expense entry from what the user described (e.g. 'paid 450 for groceries yesterday'). This does NOT save anything: the app shows the draft to the user, who confirms or discards it. Only call it when the user asks to add or log something.",
    parameters: {
      type: "OBJECT",
      properties: {
        type: { type: "STRING", description: "income or expense", enum: ["income", "expense"] },
        title: { type: "STRING", description: "Short description, 2-100 characters, e.g. 'Groceries - BigBasket'." },
        amount: { type: "NUMBER", description: "Amount in rupees, greater than zero." },
        date: { type: "STRING", description: "YYYY-MM-DD. Resolve words like 'yesterday' against today's date." },
        category: { type: "STRING", description: "Best-matching category name, e.g. Food, Rent, Travel, Shopping, Utilities, Salary, Freelance. Optional." },
      },
      required: ["type", "title", "amount", "date"],
    },
  },
];

type Args = Record<string, unknown>;

/** A transaction the copilot proposes; the user confirms it in the UI. */
export interface TransactionDraft {
  type: "income" | "expense";
  title: string;
  amount: number;
  transactionDate: string;
  categoryId?: string;
  categoryName?: string;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const numArg = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function dateArg(v: unknown, endOfDay = false) {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(s)) d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const monthName = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

async function snapshot(supabase: SupabaseServerClient) {
  const { months, balance } = await completedMonthTotals(supabase, 6);
  const now = new Date().toISOString();
  const budgets = (must(
    await supabase.from("budgets").select("id, amount").lte("period_start", now).gte("period_end", now),
  ) ?? []) as Array<{ id: string; amount: number }>;
  const spent = await spendByBudget(supabase, budgets.map((b) => b.id));
  const trailing = months.slice(-3);

  const health = computeHealthScore({
    monthlyNets: months.map((m) => m.income - m.expense),
    monthlyExpenses: months.map((m) => m.expense),
    trailingIncome: trailing.reduce((s, m) => s + m.income, 0),
    trailingExpense: trailing.reduce((s, m) => s + m.expense, 0),
    balance,
    budgetUtilisation: budgets.map((b) => (Number(b.amount) > 0 ? (spent.get(b.id) ?? 0) / Number(b.amount) : 0)),
  });

  return {
    currency: "INR",
    balance,
    averageMonthlySurplus: averageSurplus(months),
    completedMonths: months.map((m) => ({
      month: monthName(m.year, m.month),
      income: m.income,
      expense: m.expense,
      net: roundCurrency(m.income - m.expense),
    })),
    healthScore: {
      overall: health.overall,
      band: health.band,
      subScores: health.subScores.map((s) => ({
        name: s.name,
        score: s.score,
        weight: s.weight,
        detail: s.detail,
        measured: s.measured,
      })),
    },
  };
}

export async function runTool(supabase: SupabaseServerClient, name: string, args: Args): Promise<unknown> {
  switch (name) {
    case "get_financial_snapshot":
      return snapshot(supabase);

    case "get_spending_by_category": {
      const rows = must(
        await supabase.rpc("ledger_category_totals", {
          p_start: dateArg(args.startDate) ?? daysAgo(90),
          p_end: dateArg(args.endDate, true) ?? new Date().toISOString(),
          p_type: args.type === "income" ? "income" : "expense",
        }),
      ) as Array<{ category_name: string; total: number }>;
      const total = rows.reduce((s, r) => s + Number(r.total), 0);
      return {
        total: roundCurrency(total),
        categories: rows.map((r) => ({
          category: r.category_name,
          total: roundCurrency(Number(r.total)),
          sharePct: total > 0 ? Math.round((Number(r.total) / total) * 1000) / 10 : 0,
        })),
      };
    }

    case "get_monthly_trend": {
      const rows = must(
        await supabase.rpc("ledger_monthly_totals", {
          p_start: dateArg(args.startDate) ?? daysAgo(365),
          p_end: dateArg(args.endDate, true) ?? new Date().toISOString(),
        }),
      ) as Array<{ year: number; month: number; income: number; expense: number }>;
      return rows.map((r) => ({
        month: monthName(r.year, r.month),
        income: Number(r.income),
        expense: Number(r.expense),
        net: roundCurrency(Number(r.income) - Number(r.expense)),
      }));
    }

    case "search_transactions": {
      let q = supabase
        .from("transactions")
        .select("title, type, amount, transaction_date, notes, recurring_enabled, categories(name)");
      const start = dateArg(args.startDate);
      const end = dateArg(args.endDate, true);
      if (start) q = q.gte("transaction_date", start);
      if (end) q = q.lte("transaction_date", end);
      if (args.type === "income" || args.type === "expense") q = q.eq("type", args.type);
      const text = str(args.query);
      if (text) q = q.ilike("title", `%${text.replace(/[%_,()]/g, " ")}%`);
      const min = numArg(args.minAmount);
      const max = numArg(args.maxAmount);
      if (min !== undefined) q = q.gte("amount", min);
      if (max !== undefined) q = q.lte("amount", max);
      const limit = Math.min(50, Math.max(1, Math.round(numArg(args.limit) ?? 20)));
      const rows = must(
        await q.order(args.sortBy === "amount" ? "amount" : "transaction_date", { ascending: false }).limit(limit),
      ) as unknown as Array<{
        title: string;
        type: string;
        amount: number;
        transaction_date: string;
        notes: string | null;
        recurring_enabled: boolean;
        categories: { name: string } | { name: string }[] | null;
      }>;
      return rows.map((r) => ({
        title: r.title,
        type: r.type,
        amount: Number(r.amount),
        date: r.transaction_date.slice(0, 10),
        category: (Array.isArray(r.categories) ? r.categories[0]?.name : r.categories?.name) ?? "Uncategorised",
        recurring: r.recurring_enabled,
        notes: r.notes ?? undefined,
      }));
    }

    case "get_budgets": {
      const now = new Date().toISOString();
      const rows = (must(
        await supabase
          .from("budgets")
          .select("id, name, amount, cycle, period_start, period_end")
          .lte("period_start", now)
          .gte("period_end", now),
      ) ?? []) as Array<{ id: string; name: string; amount: number; cycle: string; period_end: string }>;
      const spent = await spendByBudget(supabase, rows.map((b) => b.id));
      return rows.map((b) => {
        const limit = Number(b.amount);
        const used = spent.get(b.id) ?? 0;
        return {
          name: b.name,
          cycle: b.cycle,
          limit,
          spent: used,
          remaining: roundCurrency(limit - used),
          percentUsed: limit > 0 ? Math.round((used / limit) * 1000) / 10 : 0,
          periodEnd: b.period_end.slice(0, 10),
        };
      });
    }

    case "get_goals": {
      const [goals, stats] = await Promise.all([
        supabase.from("goals").select("name, theme, target_amount, saved_amount, target_date, completed_at").then(must),
        completedMonthTotals(supabase, 3),
      ]);
      const surplus = averageSurplus(stats.months);
      return {
        monthlySurplus: surplus,
        goals: ((goals ?? []) as Array<{
          name: string;
          target_amount: number;
          saved_amount: number;
          target_date: string | null;
          completed_at: string | null;
        }>).map((g) => {
          const target = Number(g.target_amount);
          const remaining = Math.max(0, target - Number(g.saved_amount));
          return {
            name: g.name,
            target,
            saved: Number(g.saved_amount),
            remaining,
            percent: target > 0 ? Math.round((Number(g.saved_amount) / target) * 1000) / 10 : 0,
            targetDate: g.target_date?.slice(0, 10) ?? null,
            completed: Boolean(g.completed_at),
            monthsToFinishAtCurrentSurplus: remaining === 0 ? 0 : surplus > 0 ? Math.ceil(remaining / surplus) : null,
          };
        }),
      };
    }

    case "get_recurring_rules": {
      const rows = (must(
        await supabase
          .from("transactions")
          .select("title, type, amount, recurring_frequency, recurring_next_run_at")
          .eq("recurring_enabled", true),
      ) ?? []) as Array<{
        title: string;
        type: string;
        amount: number;
        recurring_frequency: string;
        recurring_next_run_at: string | null;
      }>;
      return rows.map((r) => ({
        title: r.title,
        type: r.type,
        amount: Number(r.amount),
        frequency: r.recurring_frequency,
        nextRun: r.recurring_next_run_at?.slice(0, 10) ?? null,
      }));
    }

    case "get_unusual_activity": {
      const range = {
        p_start: dateArg(args.startDate) ?? daysAgo(180),
        p_end: dateArg(args.endDate, true) ?? new Date().toISOString(),
      };
      const [outliers, duplicates, drift] = await Promise.all([
        supabase.rpc("insights_outliers", { ...range, p_min_prior: 5, p_z_threshold: 2.5, p_amount_floor: 500 }).then(must),
        supabase.rpc("insights_duplicates", { ...range, p_window_hours: 48 }).then(must),
        supabase.rpc("insights_drift", range).then(must),
      ]);
      return {
        outliers: ((outliers ?? []) as Array<{
          title: string;
          amount: number;
          category_name: string;
          transaction_date: string;
          baseline: number;
        }>)
          .slice(0, 10)
          .map((o) => ({
            title: o.title,
            amount: Number(o.amount),
            category: o.category_name,
            date: o.transaction_date.slice(0, 10),
            usualAmount: roundCurrency(Number(o.baseline)),
          })),
        possibleDuplicates: ((duplicates ?? []) as Array<{
          title: string;
          amount: number;
          transaction_date: string;
          gap_hours: number;
        }>)
          .slice(0, 10)
          .map((d) => ({
            title: d.title,
            amount: Number(d.amount),
            date: d.transaction_date.slice(0, 10),
            hoursApart: d.gap_hours,
          })),
        categoryDrift: ((drift ?? []) as Array<{
          category_name: string;
          year: number;
          month: number;
          total: number;
          trailing_avg: number;
          delta_pct: number;
        }>)
          .filter((d) => Math.abs(Number(d.delta_pct)) >= 15)
          .sort((a, b) => Math.abs(Number(b.delta_pct)) - Math.abs(Number(a.delta_pct)))
          .slice(0, 8)
          .map((d) => ({
            category: d.category_name,
            month: monthName(d.year, d.month),
            total: roundCurrency(Number(d.total)),
            trailingAverage: roundCurrency(Number(d.trailing_avg)),
            changePct: Number(d.delta_pct),
          })),
      };
    }

    case "get_group_balances":
      return groupBalances(supabase);

    case "draft_transaction":
      return draftTransaction(supabase, args);

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function groupBalances(supabase: SupabaseServerClient) {
  const { data: claims } = await supabase.auth.getClaims();
  const me = claims?.claims?.sub;
  const groups = (must(
    await supabase.from("groups").select("id, name, group_members(user_id, profiles(name))"),
  ) ?? []) as unknown as Array<{
    id: string;
    name: string;
    group_members: Array<{ user_id: string; profiles: { name: string } | { name: string }[] | null }>;
  }>;

  return Promise.all(
    groups.map(async (group) => {
      const members = await Promise.all(
        group.group_members.map(async (member) => {
          const net = Number(
            must(
              await supabase.rpc("group_member_net", { p_group_id: group.id, p_user_id: member.user_id }),
            ) ?? 0,
          );
          const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
          return { name: profile?.name ?? "Member", isYou: member.user_id === me, net: roundCurrency(net) };
        }),
      );
      return {
        group: group.name,
        yourNet: members.find((m) => m.isYou)?.net ?? 0,
        members,
      };
    }),
  );
}

/**
 * Checks a proposed entry the same way the transactions route would, and
 * resolves the category by name. Returns the draft for the UI; never writes.
 */
async function draftTransaction(supabase: SupabaseServerClient, args: Args) {
  const type = args.type === "income" ? "income" : args.type === "expense" ? "expense" : undefined;
  const title = str(args.title);
  const amount = numArg(args.amount);
  const date = str(args.date);

  const problems: string[] = [];
  if (!type) problems.push("type must be income or expense");
  if (!title || title.length < 2 || title.length > 100) problems.push("title must be 2-100 characters");
  if (amount === undefined || amount <= 0) problems.push("amount must be greater than zero");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) {
    problems.push("date must be YYYY-MM-DD");
  }
  if (problems.length) return { error: `Can't draft that: ${problems.join("; ")}. Ask the user for what's missing.` };

  let categoryId: string | undefined;
  let categoryName: string | undefined;
  const wanted = str(args.category)?.toLowerCase();
  if (wanted) {
    const categories = (must(await supabase.from("categories").select("id, name, type").eq("type", type!)) ??
      []) as Array<{ id: string; name: string }>;
    const match =
      categories.find((c) => c.name.toLowerCase() === wanted) ??
      categories.find((c) => c.name.toLowerCase().includes(wanted) || wanted.includes(c.name.toLowerCase()));
    categoryId = match?.id;
    categoryName = match?.name;
  }

  const draft: TransactionDraft = {
    type: type!,
    title: title!,
    amount: roundCurrency(amount!),
    transactionDate: `${date}T00:00:00.000Z`,
    categoryId,
    categoryName,
  };
  return { draft, note: "Shown to the user as a draft to confirm. Nothing has been saved yet." };
}
