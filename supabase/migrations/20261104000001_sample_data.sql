-- Sample data for the first-run tour.
--
-- A person can load a few months of made-up activity to see the dashboards
-- with something in them. Those rows are tagged so "Remove sample data"
-- deletes exactly them and nothing the person entered themselves.

alter table public.transactions add column if not exists is_demo boolean not null default false;
alter table public.budgets add column if not exists is_demo boolean not null default false;
alter table public.goals add column if not exists is_demo boolean not null default false;

-- Partial indexes: almost every row is real, so these stay tiny.
create index if not exists transactions_demo_idx on public.transactions (user_id) where is_demo;
create index if not exists budgets_demo_idx on public.budgets (user_id) where is_demo;
create index if not exists goals_demo_idx on public.goals (user_id) where is_demo;
