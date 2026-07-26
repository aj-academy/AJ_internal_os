-- HR, Attendance & Payroll — Phase 3: holiday calendar
-- Safe to re-run. Depends on: schema.sql, hr_payroll_01_attendance_integrity.sql
--
-- Creates public.holidays. Attendance derivation and (later) payroll payable-day
-- calculations read this table; nothing is seeded (no invented holidays).

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid (),
  holiday_date date not null unique,
  name text not null,
  holiday_type text not null default 'public'
    check (holiday_type in ('public', 'company', 'optional')),
  is_paid boolean not null default true,
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index if not exists holidays_date_idx on public.holidays (holiday_date);

drop trigger if exists holidays_set_updated_at on public.holidays;
create trigger holidays_set_updated_at
before update on public.holidays
for each row
execute function public.hr_payroll_set_updated_at ();

grant select, insert, update, delete on table public.holidays to authenticated;
alter table public.holidays enable row level security;

-- Everyone signed in can read the holiday calendar; only admins manage it.
drop policy if exists holidays_select_all on public.holidays;
create policy holidays_select_all
on public.holidays
for select
to authenticated
using (true);

drop policy if exists holidays_admin_write on public.holidays;
create policy holidays_admin_write
on public.holidays
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

-- Rollback:
--   drop table if exists public.holidays cascade;
