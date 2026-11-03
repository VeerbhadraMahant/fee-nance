-- Offline sync support (docs/offline.md).
--
-- A change made offline is queued on the device and replayed when the
-- connection returns. A replay can reach the server twice (the first
-- response was lost, or the request timed out after succeeding), so every
-- queued write must be safe to repeat:
--
--   transactions         the client picks the row's id; repeating the insert
--                        hits the primary key (the route treats that as done)
--   settlements          already unique per (group, creator, idempotency_key)
--   group expenses       this migration: a client key, unique per group and
--                        author, and create_group_expense returns the
--                        expense it already wrote instead of writing another

alter table public.group_expenses add column client_key text;

create unique index group_expenses_client_key
  on public.group_expenses (group_id, created_by, client_key)
  where client_key is not null;

drop function public.create_group_expense(uuid, text, text, numeric, text, jsonb, jsonb, jsonb, timestamptz, jsonb, uuid);

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
  p_category_id uuid default null,
  p_client_key text default null
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

  -- A replay of an expense this user already wrote: hand back the original.
  if p_client_key is not null then
    select id into v_expense from public.group_expenses
    where group_id = p_group_id and created_by = v_user and client_key = p_client_key;
    if v_expense is not null then
      return v_expense;
    end if;
  end if;

  perform public.check_group_expense_parts(p_group_id, p_amount, p_payers, p_splits, p_category_id);

  insert into public.group_expenses (
    group_id, created_by, title, notes, amount, split_type, line_items, extraction,
    incurred_at, category_id, client_key
  ) values (
    p_group_id, v_user, btrim(p_title), p_notes, p_amount, p_split_type,
    coalesce(p_line_items, '[]'::jsonb), p_extraction, coalesce(p_incurred_at, now()),
    p_category_id, p_client_key
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

-- Grants: signed-in users only, helpers not at all (as in the earlier migrations).
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
