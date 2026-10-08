-- Fee-Nance schema on Supabase Postgres.
--
-- Every table is protected by row-level security keyed on auth.uid(), so the
-- API routes run queries with the signed-in user's JWT and the database —
-- not just the route code — decides what that user can see or change.
-- Writes that touch several tables at once (a group expense with its payers
-- and splits, creating or joining a group) go through the functions in the
-- next migration so they commit atomically.

/* ── Profiles ─────────────────────────────────────────────────────────────
   One row per auth user, created by trigger on sign-up. Holds what the app
   shows about a person; identity and credentials stay in auth.users. */

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  avatar_url text,
  currency text not null default 'INR' check (currency = 'INR'),
  dashboard_default_range text not null default 'thisMonth'
    check (dashboard_default_range in ('thisMonth', 'last30Days', 'thisYear')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* ── Categories ───────────────────────────────────────────────────────────
   System categories have user_id null and are shared by everyone. */

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  type text not null check (type in ('income', 'expense')),
  icon text,
  color text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_system = (user_id is null))
);

-- NULLS NOT DISTINCT so system categories are unique by (name, type) too.
create unique index categories_owner_name_type_key
  on public.categories (user_id, name, type) nulls not distinct;

insert into public.categories (user_id, name, type, icon, color, is_system) values
  (null, 'Salary', 'income', 'wallet', '#9D7A43', true),
  (null, 'Freelance', 'income', 'briefcase', '#B88A44', true),
  (null, 'Food', 'expense', 'utensils', '#C68642', true),
  (null, 'Rent', 'expense', 'home', '#A7703B', true),
  (null, 'Travel', 'expense', 'car', '#8F6436', true),
  (null, 'Shopping', 'expense', 'bag', '#A5763F', true),
  (null, 'Utilities', 'expense', 'bolt', '#7F5A31', true);

/* ── Personal ledger ──────────────────────────────────────────────────── */

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  title text not null check (char_length(title) between 1 and 100),
  notes text,
  amount numeric(15, 2) not null check (amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  -- A deleted category leaves its transactions uncategorised, not deleted.
  category_id uuid references public.categories (id) on delete set null,
  transaction_date timestamptz not null,
  recurring_enabled boolean not null default false,
  recurring_frequency text check (recurring_frequency in ('monthly', 'yearly')),
  recurring_next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not recurring_enabled or recurring_frequency is not null)
);

create index transactions_user_date_idx on public.transactions (user_id, transaction_date desc);
create index transactions_user_type_date_idx on public.transactions (user_id, type, transaction_date desc);
create index transactions_user_category_date_idx on public.transactions (user_id, category_id, transaction_date desc);
create index transactions_recurring_due_idx on public.transactions (user_id, recurring_next_run_at)
  where recurring_enabled;

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  amount numeric(15, 2) not null check (amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  cycle text not null check (cycle in ('monthly', 'quarterly', 'yearly')),
  category_id uuid references public.categories (id) on delete set null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start)
);

create index budgets_user_period_idx on public.budgets (user_id, period_start desc);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  theme text not null default 'general'
    check (theme in ('general', 'emergency', 'travel', 'home', 'vehicle', 'education', 'gadget', 'wedding')),
  target_amount numeric(15, 2) not null check (target_amount > 0),
  saved_amount numeric(15, 2) not null default 0 check (saved_amount >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  target_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index goals_user_created_idx on public.goals (user_id, created_at desc);

/* ── Groups ───────────────────────────────────────────────────────────── */

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  created_by uuid not null references public.profiles (id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

create table public.group_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  title text not null check (char_length(title) between 1 and 120),
  notes text,
  amount numeric(15, 2) not null check (amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  split_type text not null check (split_type in ('equal', 'custom', 'percentage', 'itemized')),
  -- Itemized bills only: [{ _id, label, amount, sharedBy: [userId], proportional }].
  -- Provenance for how the split was derived; splits remain the source of truth.
  line_items jsonb not null default '[]'::jsonb,
  -- Set when the line items came from a receipt scan.
  extraction jsonb,
  incurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index group_expenses_group_incurred_idx on public.group_expenses (group_id, incurred_at desc);

create table public.group_expense_payers (
  expense_id uuid not null references public.group_expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  amount numeric(15, 2) not null check (amount > 0),
  primary key (expense_id, user_id)
);

create table public.group_expense_splits (
  expense_id uuid not null references public.group_expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  -- The raw input for custom / percentage splits; share_amount is what counts.
  amount numeric(15, 2),
  percentage numeric(7, 4),
  share_amount numeric(15, 2) not null check (share_amount >= 0),
  primary key (expense_id, user_id)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id),
  to_user_id uuid not null references public.profiles (id),
  amount numeric(15, 2) not null check (amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  note text,
  settled_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles (id),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);

create index settlements_group_settled_idx on public.settlements (group_id, settled_at desc);
create unique index settlements_idempotency_key
  on public.settlements (group_id, created_by, idempotency_key)
  where idempotency_key is not null;

/* ── updated_at ───────────────────────────────────────────────────────── */

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'categories', 'transactions', 'budgets', 'goals',
                           'groups', 'group_expenses', 'settlements']
  loop
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()', t, t);
  end loop;
end;
$$;

/* ── Membership helpers ───────────────────────────────────────────────────
   SECURITY DEFINER so policies on group tables can ask "is the caller a
   member?" without the check itself being filtered by group_members' own
   policy (which would recurse). */

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create or replace function public.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

/* ── Row-level security ───────────────────────────────────────────────── */

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.goals enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_expenses enable row level security;
alter table public.group_expense_payers enable row level security;
alter table public.group_expense_splits enable row level security;
alter table public.settlements enable row level security;

-- Profiles: yourself, plus the people you share a group with (for names).
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Categories: system ones are readable by all; your own are fully yours.
create policy categories_select on public.categories for select to authenticated
  using (is_system or user_id = auth.uid());
create policy categories_insert on public.categories for insert to authenticated
  with check (user_id = auth.uid() and not is_system);
create policy categories_update on public.categories for update to authenticated
  using (user_id = auth.uid() and not is_system)
  with check (user_id = auth.uid() and not is_system);
create policy categories_delete on public.categories for delete to authenticated
  using (user_id = auth.uid() and not is_system);

-- Personal ledger tables: owner only, every operation.
create policy transactions_owner on public.transactions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy budgets_owner on public.budgets for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_owner on public.goals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Groups: members read. Creating, joining, leaving and deleting go through
-- the functions in the next migration, so there are no direct write policies.
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id));
create policy group_members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
create policy group_expenses_select on public.group_expenses for select to authenticated
  using (public.is_group_member(group_id));
create policy group_expense_payers_select on public.group_expense_payers for select to authenticated
  using (exists (
    select 1 from public.group_expenses e
    where e.id = expense_id and public.is_group_member(e.group_id)
  ));
create policy group_expense_splits_select on public.group_expense_splits for select to authenticated
  using (exists (
    select 1 from public.group_expenses e
    where e.id = expense_id and public.is_group_member(e.group_id)
  ));

-- Settlements: members read; a member can record one between two members.
create policy settlements_select on public.settlements for select to authenticated
  using (public.is_group_member(group_id));
create policy settlements_insert on public.settlements for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_group_member(group_id)
    and exists (select 1 from public.group_members m
                where m.group_id = settlements.group_id and m.user_id = from_user_id)
    and exists (select 1 from public.group_members m
                where m.group_id = settlements.group_id and m.user_id = to_user_id)
  );
