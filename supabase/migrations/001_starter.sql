-- Run once in your Supabase project's SQL editor.
-- Replace/extend this table when the problem statement arrives.
create table if not exists public.starter_health (
  id integer primary key,
  created_at timestamptz not null default now()
);

alter table public.starter_health enable row level security;
revoke all on public.starter_health from anon, authenticated;
grant select on public.starter_health to service_role;

insert into public.starter_health (id) values (1) on conflict (id) do nothing;
