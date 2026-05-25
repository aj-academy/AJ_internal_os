-- Company policies (Admin adds name + document URL). Employees acknowledge after login.
-- Depends on: public.profiles (see schema.sql). Run schema.sql before this file.
--
-- Application usage:
--   - Admin/API (service role): CRUD company_policies; inserts into policy_acceptances
--   - Next.js routes use verified session + Supabase Admin client — RLS optional below.

create extension if not exists pgcrypto;

create table if not exists public.company_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  policy_url text not null,
  policy_category text not null default 'employee'
    check (policy_category in ('employee', 'freelancer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_policies_created_at_idx
  on public.company_policies (created_at desc);

create table if not exists public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  policy_id uuid not null references public.company_policies (id) on delete cascade,
  accepted_at timestamptz not null default now(),
  unique (profile_id, policy_id)
);

create index if not exists policy_acceptances_profile_id_idx
  on public.policy_acceptances (profile_id);

create index if not exists policy_acceptances_policy_id_idx
  on public.policy_acceptances (policy_id);

create or replace function public.company_policies_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists company_policies_set_updated_at_trigger on public.company_policies;
create trigger company_policies_set_updated_at_trigger
before update on public.company_policies
for each row
execute function public.company_policies_set_updated_at();
