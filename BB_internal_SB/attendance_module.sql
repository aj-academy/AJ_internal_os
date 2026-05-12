-- =============================================================================
-- BB Internal OS — ATTENDANCE MODULE (single run in Supabase SQL Editor)
-- =============================================================================
-- Run AFTER `schema.sql` (public.profiles exists). This bundle replaces running
-- these files separately for most projects:
--   • attendance_rls_prereqs.sql  (Section A — skip if schema.sql already ran)
--   • attendance_schema.sql     (Section B — tables + manager_remarks fix)
--   • attendance_rls.sql        (Section C — grants + RLS for attendance domain)
--
-- If you already use `permission_requests_schema.sql` for a richer
-- permission_requests table, Section B's CREATE TABLE for permission_requests
-- is harmless (IF NOT EXISTS). Prefer your extended schema when in doubt.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION A — Role helpers (required by Section C policies)
-- -----------------------------------------------------------------------------
create or replace function public.get_user_role()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (lower(btrim(coalesce(public.get_user_role(), ''))) in ('admin', 'super_admin')),
    false
  );
$$;

-- -----------------------------------------------------------------------------
-- SECTION B — Tables (attendance_records, leave, WFH, permission, work_summaries, settings)
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.profiles(id),
  attendance_date date not null,
  check_in_time timestamptz,
  check_out_time timestamptz,
  check_in_latitude numeric,
  check_in_longitude numeric,
  check_out_latitude numeric,
  check_out_longitude numeric,
  check_in_address text,
  check_out_address text,
  location_type text,
  status text,
  total_working_minutes integer,
  work_summary_required boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.profiles(id),
  leave_type text,
  from_date date,
  to_date date,
  total_days numeric,
  reason text,
  description text,
  status text default 'pending',
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz default now()
);

create table if not exists public.permission_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.profiles(id),
  permission_date date,
  from_time time,
  to_time time,
  reason text,
  description text,
  status text default 'pending',
  approved_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.work_from_home_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.profiles(id),
  wfh_date date,
  reason text,
  work_plan text,
  status text default 'pending',
  approved_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.work_summaries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.profiles(id),
  attendance_id uuid references public.attendance_records(id),
  summary_date date,
  completed_work text,
  pending_work text,
  challenges text,
  tomorrow_plan text,
  manager_remarks text,
  status text default 'submitted',
  created_at timestamptz default now()
);

alter table public.work_summaries add column if not exists manager_remarks text;

create table if not exists public.attendance_settings (
  id uuid primary key default gen_random_uuid(),
  office_name text,
  office_latitude numeric,
  office_longitude numeric,
  allowed_radius_meters integer default 200,
  standard_check_in_time time,
  standard_check_out_time time,
  late_after_time time,
  half_day_minimum_minutes integer default 240,
  enable_location_capture boolean default true,
  work_summary_required boolean default true,
  created_at timestamptz default now()
);

-- -----------------------------------------------------------------------------
-- SECTION C — Grants + RLS (attendance_records, work_summaries, permission_requests, profiles reads)
-- -----------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update on table public.attendance_records to authenticated;
grant select, insert, update on table public.work_summaries to authenticated;
grant select, insert, update on table public.permission_requests to authenticated;
grant select on table public.profiles to authenticated;

alter table public.attendance_records enable row level security;
alter table public.work_summaries enable row level security;
alter table public.permission_requests enable row level security;
alter table public.profiles enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_self_read_by_email on public.profiles;
create policy profiles_self_read_by_email
on public.profiles
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
);

drop policy if exists profiles_admin_read_all on public.profiles;
create policy profiles_admin_read_all
on public.profiles
for select
to authenticated
using (public.is_admin());

drop policy if exists profiles_authenticated_read_all on public.profiles;

drop policy if exists attendance_employee_own on public.attendance_records;
create policy attendance_employee_own
on public.attendance_records
for all
to authenticated
using (employee_id = auth.uid())
with check (employee_id = auth.uid());

drop policy if exists attendance_admin_read_all on public.attendance_records;
create policy attendance_admin_read_all
on public.attendance_records
for select
to authenticated
using (public.is_admin());

drop policy if exists work_summary_employee_own on public.work_summaries;
create policy work_summary_employee_own
on public.work_summaries
for all
to authenticated
using (employee_id = auth.uid())
with check (employee_id = auth.uid());

drop policy if exists work_summary_admin_read_update on public.work_summaries;
create policy work_summary_admin_read_update
on public.work_summaries
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists permission_employee_own on public.permission_requests;
create policy permission_employee_own
on public.permission_requests
for all
to authenticated
using (employee_id = auth.uid())
with check (employee_id = auth.uid());

drop policy if exists permission_admin_read_update on public.permission_requests;
create policy permission_admin_read_update
on public.permission_requests
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
