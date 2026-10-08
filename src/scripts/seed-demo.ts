/**
 * Fills a signed-up account with a year of realistic activity, so the
 * dashboards have something to show in a demo.
 *
 *   npm run seed:demo -- you@gmail.com            # refuses if the account has data
 *   npm run seed:demo -- you@gmail.com --reset    # wipes that account's data first
 *
 * Sign in with Google once first, so the account and its profile exist.
 * Uses SUPABASE_SERVICE_ROLE_KEY, which bypasses row-level security: run it
 * from a trusted machine only, never from the app. Two demo friends
 * (aditi.rao@feenance.demo, karan.verma@feenance.demo) are created in
 * Supabase Auth to share a group with; they can't sign in.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { computeShares } from "../lib/split";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
const reset = process.argv.includes("--reset");

if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local).");
  process.exit(1);
}
if (!email || email.startsWith("--")) {
  console.error("Usage: npm run seed:demo -- <email-you-signed-in-with> [--reset]");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

const now = new Date();
const at = (monthOffset: number, day: number, hour = 10) =>
  new Date(now.getFullYear(), now.getMonth() + monthOffset, day, hour).toISOString();
const daysAgo = (days: number) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, 13).toISOString();

async function ensureDemoFriend(client: SupabaseClient, friendEmail: string, name: string) {
  const existing = check(
    await client.from("profiles").select("id").eq("email", friendEmail).maybeSingle(),
    "look up demo friend",
  );
  if (existing) return existing.id as string;

  const created = await client.auth.admin.createUser({
    email: friendEmail,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (created.error || !created.data.user) throw new Error(`create ${friendEmail}: ${created.error?.message}`);
  return created.data.user.id; // profile row is created by the on_auth_user_created trigger
}

async function main() {
  const profile = check(
    await db.from("profiles").select("id, name").eq("email", email.toLowerCase()).maybeSingle(),
    "look up account",
  );
  if (!profile) {
    console.error(`No account for ${email}. Sign in with Google once, then re-run.`);
    process.exit(1);
  }
  const userId = profile.id as string;

  const { count } = await db
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) > 0 && !reset) {
    console.error(`${email} already has ${count} transactions. Re-run with --reset to replace them.`);
    process.exit(1);
  }

  if (reset) {
    for (const table of ["transactions", "budgets", "goals"]) {
      check(await db.from(table).delete().eq("user_id", userId), `clear ${table}`);
    }
    check(await db.from("groups").delete().eq("created_by", userId), "clear owned groups");
    check(await db.from("categories").delete().eq("user_id", userId), "clear categories");
  }

  const system = check(
    await db.from("categories").select("id, name").eq("is_system", true),
    "load system categories",
  ) as Array<{ id: string; name: string }>;
  const cat = (name: string) => {
    const found = system.find((c) => c.name === name);
    if (!found) throw new Error(`System category ${name} missing — run the migrations first`);
    return found.id;
  };

  const custom = check(
    await db
      .from("categories")
      .insert([
        { user_id: userId, name: "Subscriptions", type: "expense", icon: "repeat", color: "#7F77DD" },
        { user_id: userId, name: "Health insurance", type: "expense", icon: "shield", color: "#10B981" },
      ])
      .select("id, name"),
    "create categories",
  ) as Array<{ id: string; name: string }>;
  const subscriptions = custom.find((c) => c.name === "Subscriptions")!.id;
  const insurance = custom.find((c) => c.name === "Health insurance")!.id;

  type Txn = {
    user_id: string;
    type: "income" | "expense";
    title: string;
    amount: number;
    category_id: string | null;
    transaction_date: string;
    recurring_enabled?: boolean;
    recurring_frequency?: "monthly" | "yearly";
    recurring_next_run_at?: string;
  };
  const txns: Txn[] = [];
  const add = (t: Omit<Txn, "user_id">) => txns.push({ user_id: userId, ...t });

  for (let i = 0; i < 12; i += 1) {
    const m = i - 11;
    const last = i === 11;
    add({
      type: "income", title: "Monthly Salary", amount: 92000, category_id: cat("Salary"),
      transaction_date: at(m, 1),
      ...(last && { recurring_enabled: true, recurring_frequency: "monthly", recurring_next_run_at: at(1, 1) }),
    });
    add({
      type: "expense", title: "Apartment Rent", amount: 28000, category_id: cat("Rent"),
      transaction_date: at(m, 3),
      ...(last && { recurring_enabled: true, recurring_frequency: "monthly", recurring_next_run_at: at(1, 3) }),
    });
    add({ type: "expense", title: "Electricity & internet", amount: 2600 + (i % 4) * 180, category_id: cat("Utilities"), transaction_date: at(m, 8) });
    add({ type: "expense", title: "SIP - ELSS Tax Saver", amount: 6000, category_id: null, transaction_date: at(m, 5) });
    // Subscriptions with no recurring rule — what the Insights card should find.
    add({ type: "expense", title: "Netflix", amount: 649, category_id: subscriptions, transaction_date: at(m, 12) });
    add({ type: "expense", title: "Hotstar", amount: 299, category_id: subscriptions, transaction_date: at(m, 14) });
    add({ type: "expense", title: "Spotify", amount: 119, category_id: subscriptions, transaction_date: at(m, 16) });
    for (let w = 0; w < 4; w += 1) {
      add({ type: "expense", title: "Groceries - BigBasket", amount: 1600 + ((i + w) % 5) * 140, category_id: cat("Food"), transaction_date: at(m, 4 + w * 7, 18) });
    }
    add({ type: "expense", title: "Dinner out", amount: 1400 + (i % 3) * 400, category_id: cat("Food"), transaction_date: at(m, 20, 21) });
    add({ type: "expense", title: "Metro & cabs", amount: 1800 + (i % 2) * 300, category_id: cat("Travel"), transaction_date: at(m, 22) });
    if (i % 3 === 1) {
      add({ type: "income", title: "Freelance design project", amount: 18000, category_id: cat("Freelance"), transaction_date: at(m, 18) });
    }
    if (i % 2 === 0) {
      add({ type: "expense", title: "Clothes", amount: 3200 + (i % 4) * 600, category_id: cat("Shopping"), transaction_date: at(m, 25) });
    }
  }
  add({ type: "expense", title: "Star Health insurance premium", amount: 18500, category_id: insurance, transaction_date: at(-7, 10) });
  add({ type: "expense", title: "Flight BLR-GOI", amount: 14800, category_id: cat("Travel"), transaction_date: daysAgo(40) });
  add({ type: "expense", title: "New phone", amount: 38000, category_id: cat("Shopping"), transaction_date: daysAgo(18) });
  // A double charge for the duplicate detector.
  add({ type: "expense", title: "Swiggy order", amount: 486, category_id: cat("Food"), transaction_date: daysAgo(6) });
  add({ type: "expense", title: "Swiggy order", amount: 486, category_id: cat("Food"), transaction_date: daysAgo(6) });

  check(await db.from("transactions").insert(txns), "insert transactions");

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  check(
    await db.from("budgets").insert([
      { user_id: userId, name: "Food", amount: 9000, cycle: "monthly", category_id: cat("Food"), period_start: monthStart.toISOString(), period_end: monthEnd.toISOString() },
      { user_id: userId, name: "Shopping", amount: 5000, cycle: "monthly", category_id: cat("Shopping"), period_start: monthStart.toISOString(), period_end: monthEnd.toISOString() },
      { user_id: userId, name: "Monthly total", amount: 70000, cycle: "monthly", category_id: null, period_start: monthStart.toISOString(), period_end: monthEnd.toISOString() },
    ]),
    "insert budgets",
  );

  check(
    await db.from("goals").insert([
      { user_id: userId, name: "Six-month buffer", theme: "emergency", target_amount: 360000, saved_amount: 140000, target_date: at(14, 1) },
      { user_id: userId, name: "Goa trip", theme: "travel", target_amount: 60000, saved_amount: 21000 },
      { user_id: userId, name: "New laptop", theme: "gadget", target_amount: 90000, saved_amount: 90000, completed_at: daysAgo(10) },
    ]),
    "insert goals",
  );

  // A shared group with two demo friends.
  const aditi = await ensureDemoFriend(db, "aditi.rao@feenance.demo", "Aditi Rao");
  const karan = await ensureDemoFriend(db, "karan.verma@feenance.demo", "Karan Verma");
  const members = [userId, aditi, karan];

  const group = check(
    await db
      .from("groups")
      .insert({ name: "Hostel Squad", created_by: userId, invite_code: `DEMO${Math.random().toString(36).slice(2, 6).toUpperCase()}` })
      .select("id")
      .single(),
    "create group",
  ) as { id: string };
  check(
    await db.from("group_members").insert([
      { group_id: group.id, user_id: userId, role: "owner" },
      { group_id: group.id, user_id: aditi, role: "member" },
      { group_id: group.id, user_id: karan, role: "member" },
    ]),
    "add members",
  );

  const groupExpenses: Array<{ title: string; amount: number; payer: string; days: number }> = [
    { title: "Groceries for the flat", amount: 3450, payer: userId, days: 26 },
    { title: "Weekend trip fuel", amount: 4200, payer: aditi, days: 19 },
    { title: "Pizza night", amount: 1890, payer: karan, days: 11 },
    { title: "Wi-Fi bill", amount: 1199, payer: userId, days: 4 },
  ];
  for (const e of groupExpenses) {
    const expense = check(
      await db
        .from("group_expenses")
        .insert({ group_id: group.id, created_by: e.payer, title: e.title, amount: e.amount, split_type: "equal", incurred_at: daysAgo(e.days) })
        .select("id")
        .single(),
      "insert group expense",
    ) as { id: string };
    check(await db.from("group_expense_payers").insert({ expense_id: expense.id, user_id: e.payer, amount: e.amount }), "insert payer");
    const shares = computeShares(e.amount, "equal", [], members);
    check(
      await db.from("group_expense_splits").insert(
        shares.map((s) => ({ expense_id: expense.id, user_id: s.userId, share_amount: s.shareAmount })),
      ),
      "insert splits",
    );
  }
  check(
    await db.from("settlements").insert({
      group_id: group.id, from_user_id: karan, to_user_id: userId, amount: 800, note: "UPI", created_by: karan, settled_at: daysAgo(2),
    }),
    "insert settlement",
  );

  console.log(`Seeded ${txns.length} transactions, 3 budgets, 3 goals and a 3-person group for ${email}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
