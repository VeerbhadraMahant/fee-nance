-- Server-side functions called through supabase.rpc().
--
-- Read functions are SECURITY INVOKER: they run as the calling user, so the
-- row-level security policies from the schema migration still apply. They
-- also filter on auth.uid() explicitly, which lets the planner use the
-- (user_id, …) indexes instead of relying on the policy predicate alone.
--
-- Group write functions are SECURITY DEFINER because they touch several
-- tables at once and must commit atomically. Each one checks membership
-- itself before doing anything.

/* ── Ledger totals ────────────────────────────────────────────────────── */

create or replace function public.ledger_type_totals(
  p_start timestamptz default null,
  p_end timestamptz default null
)
returns table (type text, total numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select t.type, sum(t.amount)
  from public.transactions t
  where t.user_id = auth.uid()
    and (p_start is null or t.transaction_date >= p_start)
    and (p_end is null or t.transaction_date <= p_end)
  group by t.type;
$$;

-- Strictly-before variant, for "balance as of" a boundary.
create or replace function public.ledger_balance_before(p_before timestamptz)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(case when t.type = 'income' then t.amount else -t.amount end), 0)
  from public.transactions t
  where t.user_id = auth.uid() and t.transaction_date < p_before;
$$;

create or replace function public.ledger_category_totals(
  p_type text,
  p_start timestamptz default null,
  p_end timestamptz default null
)
returns table (category_id uuid, category_name text, total numeric, txn_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select t.category_id, coalesce(c.name, 'Uncategorized'), sum(t.amount), count(*)
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.user_id = auth.uid()
    and t.type = p_type
    and (p_start is null or t.transaction_date >= p_start)
    and (p_end is null or t.transaction_date <= p_end)
  group by t.category_id, c.name
  order by sum(t.amount) desc;
$$;

create or replace function public.ledger_monthly_totals(
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_end_exclusive boolean default false
)
returns table (year int, month int, income numeric, expense numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    extract(year from t.transaction_date)::int,
    extract(month from t.transaction_date)::int,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)
  from public.transactions t
  where t.user_id = auth.uid()
    and (p_start is null or t.transaction_date >= p_start)
    and (p_end is null
         or (p_end_exclusive and t.transaction_date < p_end)
         or (not p_end_exclusive and t.transaction_date <= p_end))
  group by 1, 2
  order by 1, 2;
$$;

create or replace function public.ledger_quarterly_totals(
  p_start timestamptz default null,
  p_end timestamptz default null
)
returns table (year int, quarter int, income numeric, expense numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    extract(year from t.transaction_date)::int,
    extract(quarter from t.transaction_date)::int,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)
  from public.transactions t
  where t.user_id = auth.uid()
    and (p_start is null or t.transaction_date >= p_start)
    and (p_end is null or t.transaction_date <= p_end)
  group by 1, 2
  order by 1, 2;
$$;

create or replace function public.ledger_daily_net(p_start timestamptz, p_end timestamptz)
returns table (day text, net numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    to_char(t.transaction_date at time zone 'UTC', 'YYYY-MM-DD'),
    sum(case when t.type = 'income' then t.amount else -t.amount end)
  from public.transactions t
  where t.user_id = auth.uid()
    and t.transaction_date >= p_start
    and t.transaction_date <= p_end
  group by 1
  order by 1;
$$;

/* ── Budget spend ─────────────────────────────────────────────────────────
   Spend against each budget in one query: every budget joined to the
   expenses inside its own period (and category, when it has one). */

create or replace function public.budget_spend(p_budget_ids uuid[])
returns table (budget_id uuid, spent numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select b.id, coalesce(sum(t.amount), 0)
  from public.budgets b
  left join public.transactions t
    on t.user_id = b.user_id
   and t.type = 'expense'
   and t.transaction_date between b.period_start and b.period_end
   and (b.category_id is null or t.category_id = b.category_id)
  where b.user_id = auth.uid() and b.id = any (p_budget_ids)
  group by b.id;
$$;

/* ── Insights ─────────────────────────────────────────────────────────────
   The three window-function analyses, ported from the MongoDB
   $setWindowFields pipelines. Same windows, same thresholds. */

-- Each expense against the eleven before it in the same category. The frame
-- ends one row back, so a spike never inflates the baseline it's judged by.
create or replace function public.insights_outliers(
  p_start timestamptz,
  p_end timestamptz,
  p_min_prior int default 5,
  p_z_threshold numeric default 2.5,
  p_amount_floor numeric default 500
)
returns table (
  id uuid, title text, amount numeric, category_id uuid, category_name text,
  transaction_date timestamptz, baseline numeric, z_score numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with windowed as (
    select
      t.id, t.title, t.amount, t.category_id, t.transaction_date,
      avg(t.amount) over w as baseline,
      stddev_samp(t.amount) over w as spread,
      count(*) over w as prior_seen
    from public.transactions t
    where t.user_id = auth.uid()
      and t.type = 'expense'
      and t.transaction_date between p_start and p_end
    window w as (
      partition by t.category_id
      order by t.transaction_date
      rows between 11 preceding and 1 preceding
    )
  ),
  scored as (
    select *,
      case when spread > 0 then (amount - baseline) / spread else 0 end as z
    from windowed
    where prior_seen >= p_min_prior
  )
  select s.id, s.title, s.amount, s.category_id, coalesce(c.name, 'Uncategorized'),
         s.transaction_date, s.baseline, s.z
  from scored s
  left join public.categories c on c.id = s.category_id
  where s.z >= p_z_threshold and s.amount >= p_amount_floor
  order by s.z desc
  limit 20;
$$;

-- The same amount and title twice within the window: a likely double-charge.
create or replace function public.insights_duplicates(
  p_start timestamptz,
  p_end timestamptz,
  p_window_hours int default 48
)
returns table (
  id uuid, previous_id uuid, title text, amount numeric, category_id uuid,
  category_name text, transaction_date timestamptz, previous_date timestamptz, gap_hours int
)
language sql
stable
security invoker
set search_path = public
as $$
  with shifted as (
    select
      t.id, t.title, t.amount, t.category_id, t.transaction_date,
      lag(t.transaction_date) over w as prev_date,
      lag(t.id) over w as prev_id
    from public.transactions t
    where t.user_id = auth.uid()
      and t.type = 'expense'
      and t.transaction_date between p_start and p_end
    window w as (
      partition by t.amount, lower(btrim(t.title))
      order by t.transaction_date
    )
  )
  select s.id, s.prev_id, s.title, s.amount, s.category_id, coalesce(c.name, 'Uncategorized'),
         s.transaction_date, s.prev_date,
         floor(extract(epoch from (s.transaction_date - s.prev_date)) / 3600)::int
  from shifted s
  left join public.categories c on c.id = s.category_id
  where s.prev_date is not null
    and s.transaction_date - s.prev_date <= make_interval(hours => p_window_hours)
  order by s.transaction_date desc
  limit 20;
$$;

-- Each category-month against the three months before it.
create or replace function public.insights_drift(p_start timestamptz, p_end timestamptz)
returns table (
  category_id uuid, category_name text, year int, month int,
  total numeric, trailing_avg numeric, delta_pct numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with monthly as (
    select
      t.category_id,
      extract(year from t.transaction_date)::int as year,
      extract(month from t.transaction_date)::int as month,
      sum(t.amount) as total
    from public.transactions t
    where t.user_id = auth.uid()
      and t.type = 'expense'
      and t.transaction_date between p_start and p_end
    group by 1, 2, 3
  ),
  windowed as (
    select *,
      avg(total) over (
        partition by category_id
        order by year, month
        rows between 3 preceding and 1 preceding
      ) as trailing_avg
    from monthly
  )
  select w.category_id, coalesce(c.name, 'Uncategorized'), w.year, w.month, w.total,
         w.trailing_avg, (w.total - w.trailing_avg) / w.trailing_avg * 100
  from windowed w
  left join public.categories c on c.id = w.category_id
  where w.trailing_avg > 0
  order by w.year desc, w.month desc;
$$;

/* ── Groups ───────────────────────────────────────────────────────────── */

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where invite_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
begin
  if v_user is null then
    raise exception 'unauthorized';
  end if;

  insert into public.groups (name, created_by, invite_code)
  values (btrim(p_name), v_user, public.generate_invite_code())
  returning id into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group, v_user, 'owner');

  return v_group;
end;
$$;

-- Joining needs to find a group the caller can't see yet, hence DEFINER.
create or replace function public.join_group(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
begin
  if v_user is null then
    raise exception 'unauthorized';
  end if;

  select id into v_group from public.groups where invite_code = upper(btrim(p_invite_code));
  if v_group is null then
    raise exception 'invalid_invite_code';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group, v_user, 'member')
  on conflict (group_id, user_id) do nothing;

  return v_group;
end;
$$;

-- The owner deletes the group for everyone; anyone else just leaves it.
create or replace function public.leave_or_delete_group(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
begin
  select role into v_role from public.group_members
  where group_id = p_group_id and user_id = v_user;

  if v_role is null then
    raise exception 'group_not_found';
  end if;

  if v_role = 'owner' then
    delete from public.groups where id = p_group_id;
    return 'deleted';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = v_user;
  return 'left';
end;
$$;

-- Expense, payers and splits in one transaction. The split arithmetic is
-- computed and validated in lib/split.ts; this re-checks the invariants that
-- protect the balance sheet (members only, parts sum to the total) so a bad
-- caller can't write an expense that breaks every balance in the group.
create or replace function public.create_group_expense(
  p_group_id uuid,
  p_title text,
  p_notes text,
  p_amount numeric,
  p_split_type text,
  p_payers jsonb,
  p_splits jsonb,
  p_line_items jsonb default '[]'::jsonb,
  p_incurred_at timestamptz default now(),
  p_extraction jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_expense uuid;
  v_payer_total numeric;
  v_share_total numeric;
begin
  if not exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = v_user) then
    raise exception 'group_not_found';
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

  select coalesce(sum((p ->> 'amount')::numeric), 0) into v_payer_total
  from jsonb_array_elements(p_payers) p;
  select coalesce(sum((s ->> 'shareAmount')::numeric), 0) into v_share_total
  from jsonb_array_elements(p_splits) s;

  if abs(v_payer_total - p_amount) > 0.01 then
    raise exception 'Payer amounts must add up to the expense total';
  end if;
  if abs(v_share_total - p_amount) > 0.01 then
    raise exception 'Split shares must add up to the expense total';
  end if;

  insert into public.group_expenses (
    group_id, created_by, title, notes, amount, split_type, line_items, extraction, incurred_at
  ) values (
    p_group_id, v_user, btrim(p_title), p_notes, p_amount, p_split_type,
    coalesce(p_line_items, '[]'::jsonb), p_extraction, coalesce(p_incurred_at, now())
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

/* ── Grants ───────────────────────────────────────────────────────────────
   Functions are executable by PUBLIC by default; narrow every one to signed-in
   users. The trigger helpers are never called directly. */

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
