/**
 * Runs the Supabase migrations against an embedded Postgres (PGlite) and
 * checks the parts the API depends on: row-level security, the ledger and
 * insights functions, and the transactional group functions.
 *
 * Supabase's `auth` schema is stubbed with the pieces the migrations use:
 * `auth.users`, `auth.uid()` (read from the same `request.jwt.claim.sub`
 * setting PostgREST sets) and the anon / authenticated / service_role roles.
 *
 *   npm run verify:db
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

const AUTH_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

// Supabase sets these default privileges on the public schema before any
// migration runs, so every new table is fully granted and RLS does the rest.
// Applying them first (not after) means a REVOKE in a migration is honoured,
// exactly as on a real project.
const SUPABASE_DEFAULT_GRANTS = `
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const ALICE = "00000000-0000-0000-0000-00000000000a";
const BOB = "00000000-0000-0000-0000-00000000000b";
const CAROL = "00000000-0000-0000-0000-00000000000c";

async function main() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(SUPABASE_DEFAULT_GRANTS);

  const dir = path.join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(path.join(dir, file), "utf8"));
    } catch (error) {
      throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log(`  applied ${file}`);
  }

  // Sign-ups go through auth.users, so the profile trigger runs.
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1, 'alice@example.com', '{"full_name":"Alice Rao"}'),
       ($2, 'bob@example.com', '{"name":"Bob"}'),
       ($3, 'carol@example.com', '{}')`,
    [ALICE, BOB, CAROL],
  );

  /** Run `fn` as a signed-in user, exactly as a PostgREST request would. */
  async function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
  }
  const rows = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const fails = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  console.log("\nProfiles");
  {
    const profiles = await rows<{ id: string; name: string }>(`select id, name from profiles order by email`);
    check("trigger creates a profile per sign-up", profiles.length === 3);
    check("name comes from full_name", profiles[0]?.name === "Alice Rao");
    check("falls back to the email local part", profiles[2]?.name === "carol");
    const seen = await as(ALICE, () => rows(`select id from profiles`));
    check("a user sees only themself before sharing a group", seen.length === 1);
    await as(ALICE, () => db.query(`update profiles set name = 'Alice R.' where id = $1`, [ALICE]));
    const renamed = await rows<{ name: string }>(`select name from profiles where id = $1`, [ALICE]);
    check("a user can rename themself", renamed[0]?.name === "Alice R.");
    const emailEdit = await fails(() =>
      as(ALICE, () => db.query(`update profiles set email = 'boss@bank.com' where id = $1`, [ALICE])),
    );
    check("a user can't rewrite their email", emailEdit !== null && /permission/i.test(emailEdit), emailEdit ?? "");
    const otherEdit = await as(BOB, () => db.query(`update profiles set name = 'Pwned' where id = $1`, [ALICE]));
    check("a user can't rename someone else", otherEdit.affectedRows === 0);
  }

  console.log("\nCategories");
  {
    const visible = await as(ALICE, () => rows(`select * from categories`));
    check("system categories are visible", visible.length === 7);
    await as(ALICE, () =>
      db.query(`insert into categories (user_id, name, type) values ($1, 'Pets', 'expense')`, [ALICE]),
    );
    const bobSees = await as(BOB, () => rows(`select * from categories where name = 'Pets'`));
    check("another user's category is invisible", bobSees.length === 0);
    const err = await fails(() =>
      as(ALICE, () => db.query(`insert into categories (user_id, name, type) values ($1, 'Pets', 'expense')`, [ALICE])),
    );
    check("duplicate (owner, name, type) is rejected", err !== null && /duplicate|unique/i.test(err), err ?? "");
    const sysEdit = await as(ALICE, () =>
      db.query(`update categories set name = 'Hacked' where is_system and name = 'Food'`),
    );
    check("system categories can't be edited", sysEdit.affectedRows === 0);
  }

  console.log("\nLedger and RLS");
  const food = (await rows<{ id: string }>(`select id from categories where name = 'Food' and is_system`))[0]!.id;
  {
    // Alice: salary every month, a steady food habit, one spike.
    await as(ALICE, async () => {
      for (let m = 0; m < 6; m += 1) {
        await db.query(
          `insert into transactions (type, title, amount, transaction_date) values ('income', 'Salary', 90000, $1)`,
          [new Date(Date.UTC(2026, m, 1, 10)).toISOString()],
        );
      }
      for (let i = 0; i < 14; i += 1) {
        await db.query(
          `insert into transactions (type, title, amount, category_id, transaction_date)
           values ('expense', 'Groceries', $1, $2, $3)`,
          [1000 + (i % 3) * 50, food, new Date(Date.UTC(2026, 0, 3 + i * 9, 12)).toISOString()],
        );
      }
      await db.query(
        `insert into transactions (type, title, amount, category_id, transaction_date)
         values ('expense', 'Wedding catering', 15000, $1, '2026-05-20T12:00:00Z')`,
        [food],
      );
      // A double charge, six hours apart.
      await db.query(
        `insert into transactions (type, title, amount, transaction_date) values
           ('expense', 'Netflix', 649, '2026-05-02T09:00:00Z'),
           ('expense', ' netflix ', 649, '2026-05-02T15:00:00Z')`,
      );
    });

    const bobView = await as(BOB, () => rows(`select * from transactions`));
    check("another user's transactions are invisible", bobView.length === 0);
    const forged = await fails(() =>
      as(BOB, () =>
        db.query(`insert into transactions (user_id, type, title, amount, transaction_date)
                  values ($1, 'expense', 'x', 1, now())`, [ALICE]),
      ),
    );
    check("can't write a transaction as someone else", forged !== null);

    const totals = await as(ALICE, () =>
      rows<{ type: string; total: string }>(`select * from ledger_type_totals(null, null) order by type`),
    );
    check("type totals", Number(totals.find((t) => t.type === "income")?.total) === 540000);
    const bobTotals = await as(BOB, () => rows(`select * from ledger_type_totals(null, null)`));
    check("functions respect RLS (Bob sees no totals)", bobTotals.length === 0);

    const months = await as(ALICE, () =>
      rows<{ month: number }>(`select * from ledger_monthly_totals('2026-01-01', '2026-07-01', true)`),
    );
    check("monthly totals have one row per active month", months.length === 6, `got ${months.length}`);

    const cats = await as(ALICE, () =>
      rows<{ category_name: string; txn_count: string }>(`select * from ledger_category_totals('expense')`),
    );
    check("category totals resolve names and nulls", cats.some((c) => c.category_name === "Uncategorized"));

    const outliers = await as(ALICE, () =>
      rows<{ title: string; z_score: string }>(`select * from insights_outliers('2026-01-01', '2026-12-31')`),
    );
    check("the wedding spike is an outlier", outliers.some((o) => o.title === "Wedding catering"));
    check("steady groceries are not", !outliers.some((o) => o.title === "Groceries"));

    const dupes = await as(ALICE, () =>
      rows<{ title: string; gap_hours: number }>(`select * from insights_duplicates('2026-01-01', '2026-12-31')`),
    );
    check("double charge detected despite case/space", dupes.length === 1 && dupes[0]!.gap_hours === 6,
      JSON.stringify(dupes));

    const drift = await as(ALICE, () =>
      rows<{ month: number; delta_pct: string }>(`select * from insights_drift('2026-01-01', '2026-12-31')`),
    );
    check("drift flags May against its trailing average",
      drift.some((d) => d.month === 5 && Number(d.delta_pct) > 100));

    const daily = await as(ALICE, () => rows(`select * from ledger_daily_net('2026-05-01', '2026-05-31')`));
    check("daily net returns rows", daily.length > 0);

    const before = await as(ALICE, () =>
      rows<{ ledger_balance_before: string }>(`select ledger_balance_before('2026-01-02')`),
    );
    check("balance strictly before a date", Number(before[0]!.ledger_balance_before) === 90000,
      JSON.stringify(before));
  }

  console.log("\nBudgets");
  {
    const [budget] = await as(ALICE, () =>
      rows<{ id: string }>(
        `insert into budgets (name, amount, cycle, category_id, period_start, period_end)
         values ('Food May', 5000, 'monthly', $1, '2026-05-01T00:00:00Z', '2026-05-31T23:59:59Z') returning id`,
        [food],
      ),
    );
    const spend = await as(ALICE, () =>
      rows<{ spent: string }>(`select * from budget_spend($1)`, [[budget!.id]]),
    );
    const expected = 15000 + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
      .filter((i) => {
        const d = new Date(Date.UTC(2026, 0, 3 + i * 9, 12));
        return d.getUTCMonth() === 4;
      })
      .reduce((s, i) => s + 1000 + (i % 3) * 50, 0);
    check("budget spend counts only its category and period", Number(spend[0]?.spent) === expected,
      `got ${spend[0]?.spent}, want ${expected}`);
    const bobSpend = await as(BOB, () => rows(`select * from budget_spend($1)`, [[budget!.id]]));
    check("can't read someone else's budget spend", bobSpend.length === 0);
  }

  console.log("\nGroups");
  {
    const [{ create_group: groupId }] = await as(ALICE, () =>
      rows<{ create_group: string }>(`select create_group('Goa trip')`),
    );
    const [{ invite_code: code }] = await as(ALICE, () =>
      rows<{ invite_code: string }>(`select invite_code from groups where id = $1`, [groupId]),
    );
    check("invite code is 8 characters", /^[A-Z2-9]{8}$/.test(code), code);

    const outsider = await as(BOB, () => rows(`select * from groups`));
    check("non-members can't see the group", outsider.length === 0);

    await as(BOB, () => db.query(`select join_group($1)`, [code.toLowerCase()]));
    await as(BOB, () => db.query(`select join_group($1)`, [code])); // idempotent
    const members = await as(BOB, () => rows(`select * from group_members where group_id = $1`, [groupId]));
    check("joining is case-insensitive and idempotent", members.length === 2);
    const names = await as(BOB, () => rows(`select name from profiles`));
    check("members can see each other's names", names.length === 2);

    const bad = await fails(() => as(BOB, () => db.query(`select join_group('NOPE1234')`)));
    check("unknown invite code is rejected", bad?.includes("invalid_invite_code") ?? false, bad ?? "");

    const expense = (payers: object, splits: object) =>
      db.query(
        `select create_group_expense($1, 'Dinner', null, 1200, 'equal', $2::jsonb, $3::jsonb)`,
        [groupId, JSON.stringify(payers), JSON.stringify(splits)],
      );

    const notMember = await fails(() =>
      as(CAROL, () => expense([{ userId: CAROL, amount: 1200 }], [{ userId: CAROL, shareAmount: 1200 }])),
    );
    check("non-member can't add an expense", notMember?.includes("group_not_found") ?? false, notMember ?? "");

    const outsiderSplit = await fails(() =>
      as(ALICE, () =>
        expense([{ userId: ALICE, amount: 1200 }], [
          { userId: ALICE, shareAmount: 600 },
          { userId: CAROL, shareAmount: 600 },
        ]),
      ),
    );
    check("participants must be members", outsiderSplit !== null, outsiderSplit ?? "");

    const badSum = await fails(() =>
      as(ALICE, () => expense([{ userId: ALICE, amount: 1000 }], [{ userId: ALICE, shareAmount: 1200 }])),
    );
    check("payers must sum to the total", badSum?.includes("Payer amounts") ?? false, badSum ?? "");

    const offByPaisa = await fails(() =>
      as(ALICE, () =>
        expense([{ userId: ALICE, amount: 1200 }], [
          { userId: ALICE, shareAmount: 600 },
          { userId: BOB, shareAmount: 599.99 },
        ]),
      ),
    );
    check("sums are compared exactly, not within 0.01", offByPaisa?.includes("Split shares") ?? false,
      offByPaisa ?? "");

    const twice = await fails(() =>
      as(ALICE, () =>
        expense([{ userId: ALICE, amount: 1200 }], [
          { userId: ALICE, shareAmount: 600 },
          { userId: ALICE, shareAmount: 600 },
        ]),
      ),
    );
    check("the same person can't appear twice", twice?.includes("twice") ?? false, twice ?? "");

    const pets = (await rows<{ id: string }>(`select id from categories where name = 'Pets'`))[0]!.id;
    const privateCategory = await fails(() =>
      as(ALICE, () =>
        db.query(
          `select create_group_expense(p_group_id => $1, p_title => 'Vet', p_notes => null, p_amount => 100,
             p_split_type => 'equal', p_payers => $2::jsonb, p_splits => $3::jsonb, p_category_id => $4)`,
          [groupId, JSON.stringify([{ userId: ALICE, amount: 100 }]),
            JSON.stringify([{ userId: ALICE, shareAmount: 100 }]), pets],
        ),
      ),
    );
    check("group expenses can't use a private category", privateCategory?.includes("shared expense") ?? false,
      privateCategory ?? "");

    const [{ create_group_expense: dinnerId }] = await as(ALICE, () =>
      rows<{ create_group_expense: string }>(
        `select create_group_expense(p_group_id => $1, p_title => 'Dinner', p_notes => null, p_amount => 1200,
           p_split_type => 'equal', p_payers => $2::jsonb, p_splits => $3::jsonb,
           p_incurred_at => '2026-05-10T19:00:00Z', p_category_id => $4)`,
        [groupId, JSON.stringify([{ userId: ALICE, amount: 1200 }]),
          JSON.stringify([{ userId: ALICE, shareAmount: 600 }, { userId: BOB, shareAmount: 600 }]), food],
      ),
    );
    const visibleToBob = await as(BOB, () =>
      rows(`select e.id, (select count(*) from group_expense_splits s where s.expense_id = e.id) as n
            from group_expenses e`),
    );
    check("members see the expense and its splits", visibleToBob.length === 1);
    const hiddenFromCarol = await as(CAROL, () => rows(`select * from group_expense_splits`));
    check("non-members see no splits", hiddenFromCarol.length === 0);

    // A share of a group expense is personal spending.
    const bobFood = await as(BOB, () =>
      rows<{ category_name: string; total: string }>(
        `select * from ledger_category_totals('expense', '2026-05-01', '2026-05-31')`,
      ),
    );
    check("a group share shows in the member's category totals",
      Number(bobFood.find((c) => c.category_name === "Food")?.total) === 600, JSON.stringify(bobFood));
    const bobPersonalOnly = await as(BOB, () =>
      rows(`select * from ledger_type_totals('2026-05-01', '2026-05-31', false)`),
    );
    check("p_include_group_shares => false leaves it out", bobPersonalOnly.length === 0);
    const [bobBudget] = await as(BOB, () =>
      rows<{ id: string }>(
        `insert into budgets (name, amount, cycle, category_id, period_start, period_end)
         values ('Food May', 2000, 'monthly', $1, '2026-05-01T00:00:00Z', '2026-05-31T23:59:59Z') returning id`,
        [food],
      ),
    );
    const bobSpend = await as(BOB, () => rows<{ spent: string }>(`select * from budget_spend($1)`, [[bobBudget!.id]]));
    check("a group share counts against the member's budget", Number(bobSpend[0]?.spent) === 600,
      JSON.stringify(bobSpend));
    await as(BOB, () => db.query(`update profiles set count_group_shares = false where id = $1`, [BOB]));
    const bobOptOut = await as(BOB, () => rows<{ spent: string }>(`select * from budget_spend($1)`, [[bobBudget!.id]]));
    check("the profile preference turns group shares off", Number(bobOptOut[0]?.spent) === 0,
      JSON.stringify(bobOptOut));
    await as(BOB, () => db.query(`update profiles set count_group_shares = true where id = $1`, [BOB]));

    // Leaving needs a settled balance.
    const owing = await fails(() => as(BOB, () => db.query(`select leave_group($1)`, [groupId])));
    check("can't leave while owing", owing?.includes("still owe ₹600.00") ?? false, owing ?? "");

    // Carol joins, so there is a third member who is party to nothing.
    await as(CAROL, () => db.query(`select join_group($1)`, [code]));

    // Editing: the author or the owner, nobody else.
    const update = (who: string, amount: number) =>
      as(who, () =>
        db.query(
          `select update_group_expense(p_expense_id => $1, p_title => 'Dinner', p_notes => null,
             p_amount => $2, p_split_type => 'custom', p_payers => $3::jsonb, p_splits => $4::jsonb,
             p_category_id => $5)`,
          [dinnerId, amount, JSON.stringify([{ userId: ALICE, amount }]),
            JSON.stringify([{ userId: ALICE, shareAmount: amount / 2 }, { userId: BOB, shareAmount: amount / 2 }]),
            food],
        ),
      );
    const carolEdit = await fails(() => update(CAROL, 1000));
    check("a member who didn't add it can't edit it", carolEdit?.includes("Only the person") ?? false,
      carolEdit ?? "");
    await update(ALICE, 1000);
    const edited = await as(BOB, () =>
      rows<{ amount: string; split_type: string }>(`select amount, split_type from group_expenses where id = $1`,
        [dinnerId]),
    );
    const bobShare = await as(BOB, () =>
      rows<{ share_amount: string }>(`select share_amount from group_expense_splits where expense_id = $1 and user_id = $2`,
        [dinnerId, BOB]),
    );
    check("the author edits amount, split and shares together",
      Number(edited[0]?.amount) === 1000 && edited[0]?.split_type === "custom" && Number(bobShare[0]?.share_amount) === 500);

    const [{ create_group_expense: tipId }] = await as(BOB, () =>
      rows<{ create_group_expense: string }>(
        `select create_group_expense($1, 'Tip', null, 100, 'equal', $2::jsonb, $3::jsonb)`,
        [groupId, JSON.stringify([{ userId: BOB, amount: 100 }]),
          JSON.stringify([{ userId: ALICE, shareAmount: 50 }, { userId: BOB, shareAmount: 50 }])],
      ),
    );
    await as(ALICE, () => db.query(`select delete_group_expense($1)`, [tipId]));
    const tipGone = await rows(`select * from group_expenses where id = $1`, [tipId]);
    check("the owner can delete someone else's expense", tipGone.length === 0);
    const carolDelete = await fails(() => as(CAROL, () => db.query(`select delete_group_expense($1)`, [dinnerId])));
    check("a bystander can't delete it", carolDelete !== null);

    // Settlements
    const bystander = await fails(() =>
      as(CAROL, () =>
        db.query(
          `insert into settlements (group_id, from_user_id, to_user_id, amount) values ($1, $2, $3, 500)`,
          [groupId, BOB, ALICE],
        ),
      ),
    );
    check("only a party can record a settlement", bystander !== null);
    await as(BOB, () =>
      db.query(
        `insert into settlements (group_id, from_user_id, to_user_id, amount, idempotency_key)
         values ($1, $2, $3, 500, 'key-12345')`,
        [groupId, BOB, ALICE],
      ),
    );
    const replay = await fails(() =>
      as(BOB, () =>
        db.query(
          `insert into settlements (group_id, from_user_id, to_user_id, amount, idempotency_key)
           values ($1, $2, $3, 500, 'key-12345')`,
          [groupId, BOB, ALICE],
        ),
      ),
    );
    check("idempotency key is unique per creator", replay !== null);
    const toOutsider = await fails(() =>
      as(BOB, () =>
        db.query(
          `insert into settlements (group_id, from_user_id, to_user_id, amount) values ($1, $2, $3, 10)`,
          [groupId, BOB, "00000000-0000-0000-0000-0000000000dd"],
        ),
      ),
    );
    check("can't settle with a non-member", toOutsider !== null);
    const carolUnsettles = await as(CAROL, () => db.query(`delete from settlements where group_id = $1`, [groupId]));
    check("a bystander can't delete a settlement", carolUnsettles.affectedRows === 0);
    const [{ id: strayId }] = await as(ALICE, () =>
      rows<{ id: string }>(
        `insert into settlements (group_id, from_user_id, to_user_id, amount) values ($1, $2, $3, 1) returning id`,
        [groupId, ALICE, BOB],
      ),
    );
    const bobRemoves = await as(BOB, () => db.query(`delete from settlements where id = $1`, [strayId]));
    check("a party can delete a settlement", bobRemoves.affectedRows === 1);

    // Leaving and deleting
    const left = await as(BOB, () => rows<{ leave_group: string }>(`select leave_group($1)`, [groupId]));
    check("a settled member leaves", left[0]?.leave_group === "left");
    const kept = await as(BOB, () =>
      rows<{ category_name: string; total: string }>(
        `select * from ledger_category_totals('expense', '2026-05-01', '2026-05-31')`,
      ),
    );
    check("a former member keeps their share in their history",
      Number(kept.find((c) => c.category_name === "Food")?.total) === 500, JSON.stringify(kept));

    const handover = await as(ALICE, () => rows<{ leave_group: string }>(`select leave_group($1)`, [groupId]));
    const newOwner = await as(CAROL, () =>
      rows<{ role: string }>(`select role from group_members where group_id = $1 and user_id = $2`, [groupId, CAROL]),
    );
    check("an owner leaving hands the group on", handover[0]?.leave_group === "left" && newOwner[0]?.role === "owner",
      JSON.stringify({ handover, newOwner }));
    const survives = await rows(`select * from group_expenses where group_id = $1`, [groupId]);
    check("the group's history survives the owner leaving", survives.length === 1);

    const deleted = await as(CAROL, () => rows<{ delete_group: string }>(`select delete_group($1)`, [groupId]));
    check("the owner deletes", deleted[0]?.delete_group === "deleted");
    const leftovers = await rows(`select * from group_expenses`);
    check("deleting cascades to expenses", leftovers.length === 0);
  }

  console.log("\nDirect writes");
  {
    const [rule] = await as(ALICE, () =>
      rows<{ id: string }>(
        `insert into transactions (type, title, amount, transaction_date, recurring_enabled, recurring_frequency)
         values ('expense', 'Rent', 20000, '2026-01-31T00:00:00Z', true, 'monthly') returning id`,
      ),
    );
    const occurrence = () =>
      as(ALICE, () =>
        db.query(
          `insert into transactions (type, title, amount, transaction_date, recurring_source_id)
           values ('expense', 'Rent', 20000, '2026-02-28T00:00:00Z', $1)`,
          [rule!.id],
        ),
      );
    await occurrence();
    const again = await fails(occurrence);
    check("one occurrence per rule per date", again !== null && /duplicate|unique/i.test(again), again ?? "");

    const borrowedRule = await fails(() =>
      as(BOB, () =>
        db.query(
          `insert into transactions (type, title, amount, transaction_date, recurring_source_id)
           values ('expense', 'x', 1, now(), $1)`,
          [rule!.id],
        ),
      ),
    );
    check("can't attach an occurrence to someone else's rule", borrowedRule !== null);

    const pets = (await rows<{ id: string }>(`select id from categories where name = 'Pets'`))[0]!.id;
    const borrowedCategory = await fails(() =>
      as(BOB, () =>
        db.query(
          `insert into transactions (type, title, amount, transaction_date, category_id)
           values ('expense', 'x', 1, now(), $1)`,
          [pets],
        ),
      ),
    );
    check("can't file under someone else's category", borrowedCategory !== null);

    await as(ALICE, () => db.query(`update profiles set upi_id = 'alice.rao@okaxis' where id = $1`, [ALICE]));
    const badUpi = await fails(() =>
      as(ALICE, () => db.query(`update profiles set upi_id = 'not a upi id' where id = $1`, [ALICE])),
    );
    check("UPI IDs are validated", badUpi !== null);
  }

  console.log("\nGrants");
  {
    const anon = await fails(async () => {
      await db.exec(`set role anon`);
      try {
        await db.query(`select * from ledger_type_totals(null, null)`);
      } finally {
        await db.exec(`reset role`);
      }
    });
    check("anonymous callers can't execute functions", anon !== null);
  }

  await db.close();
  console.log(failures === 0 ? "\nAll database checks passed.\n" : `\n${failures} FAILURE(S)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
