-- Follow-up to the November 2026 assessment (docs/assessment-2026-11.md).
--
--   1. Recurring occurrences link to their rule, one per rule per date.
--   2. Profiles gain a UPI ID and a "count group shares" preference.
--   3. Group expenses gain a category, so a member's share can count against
--      their own budgets.
--   4. One personal ledger: transactions plus the caller's share of every
--      group expense. The ledger and budget functions read from it.
--   5. Group expense writes compare sums exactly, reject duplicate people,
--      and can be edited and deleted by their author or the group owner.
--   6. Leaving a group needs a settled balance; an owner who leaves hands the
--      group to the longest-standing member instead of deleting it.
--   7. Only a party to a settlement can record or delete it.
--   8. Direct writes can't borrow someone else's category or recurring rule.

/* ── 1. Recurring occurrences ─────────────────────────────────────────── */

alter table public.transactions
  add column recurring_source_id uuid references public.transactions (id) on delete set null;

-- NULLs are distinct, so ordinary transactions are unaffected. Generation
-- inserts with ON CONFLICT DO NOTHING against this index, which makes two
-- concurrent runs (or a re-run after a partial failure) harmless.
create unique index transactions_recurring_occurrence_key
  on public.transactions (recurring_source_id, transaction_date);

/* ── 2. Profiles ──────────────────────────────────────────────────────── */

alter table public.profiles
  add column upi_id text
    check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,63}$'),
  add column count_group_shares boolean not null default true;

grant update (upi_id, count_group_shares) on public.profiles to authenticated;

/* ── 3. Group expense category ────────────────────────────────────────── */

-- Restricted to the shared system expense categories (checked by the write
-- functions): a member's private category means nothing to the others.
alter table public.group_expenses
  add column category_id uuid references public.categories (id) on delete set null;

/* ── Helpers ──────────────────────────────────────────────────────────── */

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.can_use_category(p_category_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.categories
    where id = p_category_id and (is_system or user_id = auth.uid())
  );
$$;

-- DEFINER so the transactions policy can call it without recursing into itself.
create or replace function public.owns_transaction(p_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.transactions
    where id = p_transaction_id and user_id = auth.uid()
  );
$$;

/* ── 8. Policies for direct writes ────────────────────────────────────── */

drop policy transactions_owner on public.transactions;
create policy transactions_owner on public.transactions for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (category_id is null or public.can_use_category(category_id))
    and (recurring_source_id is null or public.owns_transaction(recurring_source_id))
  );

drop policy budgets_owner on public.budgets;
create policy budgets_owner on public.budgets for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (category_id is null or public.can_use_category(category_id))
  );

/* ── 4. One personal ledger ───────────────────────────────────────────────
   Personal transactions, plus the caller's share of each group expense as
   an expense in that expense's category on the day it was incurred. What
   the caller *paid* for the group is deliberately absent: paying ₹3,000 for
   a ₹1,000 share is ₹1,000 of spending and ₹2,000 owed back, not ₹3,000 of
   spending.

   p_include_group_shares: true or false forces it; null follows the
   caller's profile preference (on by default).

   SECURITY DEFINER, unlike the other read functions, so a share stays in
   the caller's history after they leave the group (RLS would hide the
   expense from a former member). Both halves filter on auth.uid()
   explicitly, so it can only ever return the caller's own rows. */

create or replace function public.my_ledger_entries(
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_include_group_shares boolean default null
)
returns table (type text, amount numeric, category_id uuid, entry_date timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.type, t.amount, t.category_id, t.transaction_date
  from public.transactions t
  where t.user_id = auth.uid()
    and (p_start is null or t.transaction_date >= p_start)
    and (p_end is null or t.transaction_date <= p_end)
  union all
  select 'expense', s.share_amount, e.category_id, e.incurred_at
  from public.group_expense_splits s
  join public.group_expenses e on e.id = s.expense_id
  where s.user_id = auth.uid()
    and s.share_amount > 0
    and coalesce(
      p_include_group_shares,
      (select p.count_group_shares from public.profiles p where p.id = auth.uid()),
      true
    )
    and (p_start is null or e.incurred_at >= p_start)
    and (p_end is null or e.incurred_at <= p_end);
$$;

drop function public.ledger_type_totals(timestamptz, timestamptz);
create function public.ledger_type_totals(
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_include_group_shares boolean default null
)
returns table (type text, total numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select l.type, sum(l.amount)
  from public.my_ledger_entries(p_start, p_end, p_include_group_shares) l
  group by l.type;
$$;

drop function public.ledger_balance_before(timestamptz);
create function public.ledger_balance_before(
  p_before timestamptz,
  p_include_group_shares boolean default null
)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(case when l.type = 'income' then l.amount else -l.amount end), 0)
  from public.my_ledger_entries(null, p_before, p_include_group_shares) l
  where l.entry_date < p_before;
$$;

drop function public.ledger_category_totals(text, timestamptz, timestamptz);
create function public.ledger_category_totals(
  p_type text,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_include_group_shares boolean default null
)
returns table (category_id uuid, category_name text, total numeric, txn_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select l.category_id, coalesce(c.name, 'Uncategorized'), sum(l.amount), count(*)
  from public.my_ledger_entries(p_start, p_end, p_include_group_shares) l
  left join public.categories c on c.id = l.category_id
  where l.type = p_type
  group by l.category_id, c.name
  order by sum(l.amount) desc;
$$;

drop function public.ledger_monthly_totals(timestamptz, timestamptz, boolean);
create function public.ledger_monthly_totals(
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_end_exclusive boolean default false,
  p_include_group_shares boolean default null
)
returns table (year int, month int, income numeric, expense numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    extract(year from l.entry_date)::int,
    extract(month from l.entry_date)::int,
    coalesce(sum(l.amount) filter (where l.type = 'income'), 0),
    coalesce(sum(l.amount) filter (where l.type = 'expense'), 0)
  from public.my_ledger_entries(p_start, p_end, p_include_group_shares) l
  where p_end is null or not p_end_exclusive or l.entry_date < p_end
  group by 1, 2
  order by 1, 2;
$$;

drop function public.ledger_quarterly_totals(timestamptz, timestamptz);
create function public.ledger_quarterly_totals(
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_include_group_shares boolean default null
)
returns table (year int, quarter int, income numeric, expense numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    extract(year from l.entry_date)::int,
    extract(quarter from l.entry_date)::int,
    coalesce(sum(l.amount) filter (where l.type = 'income'), 0),
    coalesce(sum(l.amount) filter (where l.type = 'expense'), 0)
  from public.my_ledger_entries(p_start, p_end, p_include_group_shares) l
  group by 1, 2
  order by 1, 2;
$$;

drop function public.ledger_daily_net(timestamptz, timestamptz);
create function public.ledger_daily_net(
  p_start timestamptz,
  p_end timestamptz,
  p_include_group_shares boolean default null
)
returns table (day text, net numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    to_char(l.entry_date at time zone 'UTC', 'YYYY-MM-DD'),
    sum(case when l.type = 'income' then l.amount else -l.amount end)
  from public.my_ledger_entries(p_start, p_end, p_include_group_shares) l
  group by 1
  order by 1;
$$;

-- Same signature as before, so callers don't change. Group shares count
-- against a budget when the caller's preference says so.
create or replace function public.budget_spend(p_budget_ids uuid[])
returns table (budget_id uuid, spent numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select b.id, coalesce(sum(l.amount), 0)
  from public.budgets b
  left join lateral (
    select e.amount
    from public.my_ledger_entries(b.period_start, b.period_end) e
    where e.type = 'expense'
      and (b.category_id is null or e.category_id = b.category_id)
  ) l on true
  where b.user_id = auth.uid() and b.id = any (p_budget_ids)
  group by b.id;
$$;

/* ── 5. Group expense writes ──────────────────────────────────────────── */

-- The checks every expense write shares. Raises with a user-facing message.
create or replace function public.check_group_expense_parts(
  p_group_id uuid,
  p_amount numeric,
  p_payers jsonb,
  p_splits jsonb,
  p_category_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_payer_total numeric;
  v_share_total numeric;
begin
  if jsonb_array_length(coalesce(p_payers, '[]'::jsonb)) = 0 then
    raise exception 'At least one payer is required';
  end if;
  if jsonb_array_length(coalesce(p_splits, '[]'::jsonb)) = 0 then
    raise exception 'At least one person must share the expense';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_payers) p
    where not exists (select 1 from public.group_members m
                      where m.group_id = p_group_id and m.user_id = (p ->> 'userId')::uuid)
  ) or exists (
    select 1 from jsonb_array_elements(p_splits) s
    where not exists (select 1 from public.group_members m
                      where m.group_id = p_group_id and m.user_id = (s ->> 'userId')::uuid)
  ) then
    raise exception 'All payers and participants must belong to the group';
  end if;

  if (select count(distinct p ->> 'userId') <> count(*) from jsonb_array_elements(p_payers) p)
     or (select count(distinct s ->> 'userId') <> count(*) from jsonb_array_elements(p_splits) s) then
    raise exception 'The same person appears twice in the payers or the split';
  end if;

  select sum((p ->> 'amount')::numeric) into v_payer_total from jsonb_array_elements(p_payers) p;
  select sum((s ->> 'shareAmount')::numeric) into v_share_total from jsonb_array_elements(p_splits) s;

  -- numeric is exact, so the parts must equal the total to the paisa.
  if v_payer_total <> p_amount then
    raise exception 'Payer amounts add up to %, not the expense total of %', v_payer_total, p_amount;
  end if;
  if v_share_total <> p_amount then
    raise exception 'Split shares add up to %, not the expense total of %', v_share_total, p_amount;
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories
    where id = p_category_id and is_system and type = 'expense'
  ) then
    raise exception 'Group expenses use the shared expense categories';
  end if;
end;
$$;

drop function public.create_group_expense(uuid, text, text, numeric, text, jsonb, jsonb, jsonb, timestamptz, jsonb);
create function public.create_group_expense(
  p_group_id uuid,
  p_title text,
  p_notes text,
  p_amount numeric,
  p_split_type text,
  p_payers jsonb,
  p_splits jsonb,
  p_line_items jsonb default '[]'::jsonb,
  p_incurred_at timestamptz default now(),
  p_extraction jsonb default null,
  p_category_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_expense uuid;
begin
  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = v_user) then
    raise exception 'group_not_found';
  end if;

  perform public.check_group_expense_parts(p_group_id, p_amount, p_payers, p_splits, p_category_id);

  insert into public.group_expenses (
    group_id, created_by, title, notes, amount, split_type, line_items, extraction,
    incurred_at, category_id
  ) values (
    p_group_id, v_user, btrim(p_title), p_notes, p_amount, p_split_type,
    coalesce(p_line_items, '[]'::jsonb), p_extraction, coalesce(p_incurred_at, now()), p_category_id
  )
  returning id into v_expense;

  insert into public.group_expense_payers (expense_id, user_id, amount)
  select v_expense, (p ->> 'userId')::uuid, (p ->> 'amount')::numeric
  from jsonb_array_elements(p_payers) p;

  insert into public.group_expense_splits (expense_id, user_id, amount, percentage, share_amount)
  select v_expense, (s ->> 'userId')::uuid, (s ->> 'amount')::numeric,
         (s ->> 'percentage')::numeric, (s ->> 'shareAmount')::numeric
  from jsonb_array_elements(p_splits) s;

  return v_expense;
end;
$$;

-- Loads an expense the caller may change: they wrote it, or they own the group.
create or replace function public.editable_group_expense(p_expense_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
  v_author uuid;
begin
  select group_id, created_by into v_group, v_author
  from public.group_expenses where id = p_expense_id;

  if v_group is null or not exists (
    select 1 from public.group_members where group_id = v_group and user_id = v_user
  ) then
    raise exception 'expense_not_found';
  end if;

  if v_author <> v_user and not exists (
    select 1 from public.group_members
    where group_id = v_group and user_id = v_user and role = 'owner'
  ) then
    raise exception 'Only the person who added this expense or the group owner can change it';
  end if;

  return v_group;
end;
$$;

-- Replaces the expense's fields, payers and splits in one transaction.
create or replace function public.update_group_expense(
  p_expense_id uuid,
  p_title text,
  p_notes text,
  p_amount numeric,
  p_split_type text,
  p_payers jsonb,
  p_splits jsonb,
  p_line_items jsonb default '[]'::jsonb,
  p_incurred_at timestamptz default null,
  p_category_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid := public.editable_group_expense(p_expense_id);
begin
  perform public.check_group_expense_parts(v_group, p_amount, p_payers, p_splits, p_category_id);

  update public.group_expenses set
    title = btrim(p_title),
    notes = p_notes,
    amount = p_amount,
    split_type = p_split_type,
    line_items = coalesce(p_line_items, '[]'::jsonb),
    -- A hand edit supersedes whatever a receipt scan proposed.
    extraction = case when p_split_type = 'itemized' then extraction else null end,
    incurred_at = coalesce(p_incurred_at, incurred_at),
    category_id = p_category_id
  where id = p_expense_id;

  delete from public.group_expense_payers where expense_id = p_expense_id;
  delete from public.group_expense_splits where expense_id = p_expense_id;

  insert into public.group_expense_payers (expense_id, user_id, amount)
  select p_expense_id, (p ->> 'userId')::uuid, (p ->> 'amount')::numeric
  from jsonb_array_elements(p_payers) p;

  insert into public.group_expense_splits (expense_id, user_id, amount, percentage, share_amount)
  select p_expense_id, (s ->> 'userId')::uuid, (s ->> 'amount')::numeric,
         (s ->> 'percentage')::numeric, (s ->> 'shareAmount')::numeric
  from jsonb_array_elements(p_splits) s;

  return v_group;
end;
$$;

create or replace function public.delete_group_expense(p_expense_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid := public.editable_group_expense(p_expense_id);
begin
  delete from public.group_expenses where id = p_expense_id;
  return v_group;
end;
$$;

/* ── 6. Leaving and deleting groups ───────────────────────────────────── */

-- A member's net position: positive means the group owes them.
create or replace function public.group_member_net(p_group_id uuid, p_user_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select
      coalesce((select sum(p.amount) from public.group_expense_payers p
                join public.group_expenses e on e.id = p.expense_id
                where e.group_id = p_group_id and p.user_id = p_user_id), 0)
    - coalesce((select sum(s.share_amount) from public.group_expense_splits s
                join public.group_expenses e on e.id = s.expense_id
                where e.group_id = p_group_id and s.user_id = p_user_id), 0)
    + coalesce((select sum(amount) from public.settlements
                where group_id = p_group_id and from_user_id = p_user_id), 0)
    - coalesce((select sum(amount) from public.settlements
                where group_id = p_group_id and to_user_id = p_user_id), 0);
$$;

-- Leave a group. Refused while the caller owes or is owed anything, since a
-- departed member can no longer be paid. An owner hands the group to the
-- longest-standing remaining member; the last member out deletes it.
create or replace function public.leave_group(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_net numeric;
  v_successor uuid;
begin
  select role into v_role from public.group_members
  where group_id = p_group_id and user_id = v_user;
  if v_role is null then
    raise exception 'group_not_found';
  end if;

  v_net := public.group_member_net(p_group_id, v_user);
  if v_net <> 0 then
    raise exception 'You % ₹% in this group. Settle up before leaving.',
      case when v_net < 0 then 'still owe' else 'are still owed' end,
      to_char(abs(v_net), 'FM999,999,999,990.00');
  end if;

  select user_id into v_successor from public.group_members
  where group_id = p_group_id and user_id <> v_user
  order by joined_at, user_id
  limit 1;

  if v_successor is null then
    delete from public.groups where id = p_group_id;
    return 'deleted';
  end if;

  if v_role = 'owner' then
    update public.group_members set role = 'owner'
    where group_id = p_group_id and user_id = v_successor;
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = v_user;
  return 'left';
end;
$$;

-- The owner deletes the group, and its history, for everyone.
create or replace function public.delete_group(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.group_members
  where group_id = p_group_id and user_id = auth.uid();
  if v_role is null then
    raise exception 'group_not_found';
  end if;
  if v_role <> 'owner' then
    raise exception 'Only the group owner can delete the group';
  end if;

  delete from public.groups where id = p_group_id;
  return 'deleted';
end;
$$;

drop function public.leave_or_delete_group(uuid);

/* ── 7. Settlements ───────────────────────────────────────────────────── */

drop policy settlements_insert on public.settlements;
create policy settlements_insert on public.settlements for insert to authenticated
  with check (
    created_by = auth.uid()
    and auth.uid() in (from_user_id, to_user_id)
    and public.is_group_member(group_id)
    and exists (select 1 from public.group_members m
                where m.group_id = settlements.group_id and m.user_id = from_user_id)
    and exists (select 1 from public.group_members m
                where m.group_id = settlements.group_id and m.user_id = to_user_id)
  );

create policy settlements_delete on public.settlements for delete to authenticated
  using (
    public.is_group_member(group_id)
    and auth.uid() in (from_user_id, to_user_id, created_by)
  );

/* ── Grants ───────────────────────────────────────────────────────────────
   As in the functions migration: signed-in users only, and the internal
   helpers not at all. */

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end;
$$;

revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.touch_updated_at() from authenticated;
revoke execute on function public.check_group_expense_parts(uuid, numeric, jsonb, jsonb, uuid) from authenticated;
revoke execute on function public.editable_group_expense(uuid) from authenticated;
