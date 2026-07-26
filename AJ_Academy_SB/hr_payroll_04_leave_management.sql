-- HR, Attendance & Payroll — Phase 4: leave management (fresh module)
-- Safe to re-run. Depends on: schema.sql, hr_payroll_01..03
--
-- Design decisions (confirmed with product owner):
--   * Fresh module: legacy leave_requests (attendance_module.sql) is DEPRECATED and untouched.
--   * Approval: HR/Admin approves directly (no manager step for now).
--   * Only APPROVED leave affects attendance and payroll.
--
-- Tables: leave_types, leave_balances, leave_applications.
-- Leave types are seeded with NAMES + paid/unpaid flags only; annual entitlements
-- default to 0 and MUST be configured by the company (no invented policy numbers).

create extension if not exists btree_gist;

-- =============================================================================
-- 1) leave_types
-- =============================================================================
create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid (),
  code text not null unique,
  name text not null,
  is_paid boolean not null default true,
  annual_entitlement numeric(6, 2) not null default 0 check (annual_entitlement >= 0),
  monthly_accrual numeric(6, 2) not null default 0 check (monthly_accrual >= 0),
  carry_forward_allowed boolean not null default false,
  max_carry_forward numeric(6, 2) not null default 0 check (max_carry_forward >= 0),
  max_balance numeric(6, 2),
  min_notice_days integer not null default 0 check (min_notice_days >= 0),
  requires_document boolean not null default false,
  allows_half_day boolean not null default true,
  allow_negative_balance boolean not null default false,
  counts_as_presence boolean not null default false, -- e.g. WFH: attendance credit, not leave burn
  is_active boolean not null default true,
  effective_from date not null default current_date,
  sort_order integer not null default 100,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

drop trigger if exists leave_types_set_updated_at on public.leave_types;
create trigger leave_types_set_updated_at
before update on public.leave_types
for each row
execute function public.hr_payroll_set_updated_at ();

-- Seed type NAMES only (entitlements stay 0 until the company configures them).
insert into public.leave_types (code, name, is_paid, requires_document, counts_as_presence, sort_order)
values
  ('CL',   'Casual Leave',        true,  false, false, 10),
  ('SL',   'Sick Leave',          true,  false, false, 20),
  ('EL',   'Earned Leave',        true,  false, false, 30),
  ('PL',   'Paid Leave',          true,  false, false, 40),
  ('LWP',  'Unpaid Leave (LWP)',  false, false, false, 50),
  ('CO',   'Compensatory Off',    true,  false, false, 60),
  ('WFH',  'Work From Home',      true,  false, true,  70),
  ('ML',   'Maternity Leave',     true,  true,  false, 80),
  ('PTL',  'Paternity Leave',     true,  true,  false, 90),
  ('OTH',  'Other Leave',         false, false, false, 100)
on conflict (code) do nothing;

-- =============================================================================
-- 2) leave_balances (per employee, type, year)
-- =============================================================================
create table if not exists public.leave_balances (
  id uuid primary key default gen_random_uuid (),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  opening_balance numeric(6, 2) not null default 0,
  accrued numeric(6, 2) not null default 0,
  used numeric(6, 2) not null default 0,
  adjusted numeric(6, 2) not null default 0, -- manual admin adjustment (+/-), audited
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  unique (employee_id, leave_type_id, year)
);

create index if not exists leave_balances_employee_idx
  on public.leave_balances (employee_id, year desc);

drop trigger if exists leave_balances_set_updated_at on public.leave_balances;
create trigger leave_balances_set_updated_at
before update on public.leave_balances
for each row
execute function public.hr_payroll_set_updated_at ();

-- =============================================================================
-- 3) leave_applications
-- =============================================================================
create table if not exists public.leave_applications (
  id uuid primary key default gen_random_uuid (),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id),
  start_date date not null,
  end_date date not null,
  is_half_day boolean not null default false,
  half_day_session text check (half_day_session in ('first_half', 'second_half')),
  total_days numeric(6, 2) not null check (total_days > 0),
  reason text not null,
  contact_info text,
  attachment_url text,
  attachment_path text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  applied_at timestamptz not null default now (),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_remarks text,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint leave_applications_date_range_chk check (end_date >= start_date),
  constraint leave_applications_half_day_chk
    check (not is_half_day or start_date = end_date)
);

-- Prevent overlapping pending/approved leave for the same employee.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_applications_no_overlap'
  ) then
    alter table public.leave_applications
      add constraint leave_applications_no_overlap
      exclude using gist (
        employee_id with =,
        daterange(start_date, end_date, '[]') with &&
      )
      where (status in ('pending', 'approved'));
  end if;
end $$;

create index if not exists leave_applications_employee_idx
  on public.leave_applications (employee_id, start_date desc);
create index if not exists leave_applications_status_idx
  on public.leave_applications (status, applied_at desc);
create index if not exists leave_applications_range_idx
  on public.leave_applications (start_date, end_date)
  where status = 'approved';

drop trigger if exists leave_applications_set_updated_at on public.leave_applications;
create trigger leave_applications_set_updated_at
before update on public.leave_applications
for each row
execute function public.hr_payroll_set_updated_at ();

-- =============================================================================
-- 4) Grants + RLS
-- =============================================================================
grant select on table public.leave_types to authenticated;
grant insert, update, delete on table public.leave_types to authenticated;
grant select, insert, update, delete on table public.leave_balances to authenticated;
grant select, insert, update, delete on table public.leave_applications to authenticated;

alter table public.leave_types enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_applications enable row level security;

-- leave_types: all signed-in users read; admins manage.
drop policy if exists leave_types_select_all on public.leave_types;
create policy leave_types_select_all
on public.leave_types
for select
to authenticated
using (true);

drop policy if exists leave_types_admin_write on public.leave_types;
create policy leave_types_admin_write
on public.leave_types
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

-- leave_balances: employees read own; admins manage all (writes go via service role / API).
drop policy if exists leave_balances_select on public.leave_balances;
create policy leave_balances_select
on public.leave_balances
for select
to authenticated
using (employee_id = auth.uid () or public.is_admin ());

drop policy if exists leave_balances_admin_write on public.leave_balances;
create policy leave_balances_admin_write
on public.leave_balances
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

-- leave_applications: employees create their own pending requests and read their own;
-- employees may cancel their own PENDING request; admins manage everything.
drop policy if exists leave_applications_select on public.leave_applications;
create policy leave_applications_select
on public.leave_applications
for select
to authenticated
using (employee_id = auth.uid () or public.is_admin ());

drop policy if exists leave_applications_employee_insert on public.leave_applications;
create policy leave_applications_employee_insert
on public.leave_applications
for insert
to authenticated
with check (employee_id = auth.uid () and status = 'pending');

drop policy if exists leave_applications_employee_cancel on public.leave_applications;
create policy leave_applications_employee_cancel
on public.leave_applications
for update
to authenticated
using (employee_id = auth.uid () and status = 'pending')
with check (employee_id = auth.uid () and status in ('pending', 'cancelled'));

drop policy if exists leave_applications_admin_all on public.leave_applications;
create policy leave_applications_admin_all
on public.leave_applications
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

-- Rollback:
--   drop table if exists public.leave_applications cascade;
--   drop table if exists public.leave_balances cascade;
--   drop table if exists public.leave_types cascade;
