-- Quick patch: run if client_lead_schema.sql / client_master_schema.sql failed with
-- ERROR 42703 column "follow_up_date" (or source, assigned_to, etc.) does not exist.
-- Safe when public.clients already exists from project_master_schema.sql (minimal stub).

alter table public.clients add column if not exists company_name text;
alter table public.clients add column if not exists email text;
alter table public.clients add column if not exists phone text;
alter table public.clients add column if not exists source text;
alter table public.clients add column if not exists requirement text;
alter table public.clients add column if not exists budget numeric(12, 2);
alter table public.clients add column if not exists notes text;
alter table public.clients add column if not exists assigned_to uuid references public.profiles(id);
alter table public.clients add column if not exists follow_up_date date;
alter table public.clients add column if not exists created_at timestamptz not null default now();

create index if not exists clients_source_idx on public.clients(source);
create index if not exists clients_assigned_to_idx on public.clients(assigned_to);
create index if not exists clients_follow_up_date_idx on public.clients(follow_up_date);
create index if not exists clients_created_at_idx on public.clients(created_at desc);
