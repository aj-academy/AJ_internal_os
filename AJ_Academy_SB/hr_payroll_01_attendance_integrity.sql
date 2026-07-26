-- HR, Attendance & Payroll — Phase 1: attendance data integrity + correction queue + audit activation
-- Safe to re-run. Reuses existing attendance_records / profiles / audit_logs.
-- Run AFTER: schema.sql, attendance_module.sql, attendance_delete_grants.sql
--
-- What it does:
--   1) De-duplicates attendance_records so (employee_id, attendance_date) is unique,
--      preserving the most complete row and re-pointing work_summaries to the kept row.
--   2) Adds a UNIQUE index on (employee_id, attendance_date).
--   3) Creates attendance_corrections (review/correction queue) with RLS.
--   4) Activates audit_logs (RLS admin-read + indexes) so the app can record a real audit trail.
--
-- This script does NOT modify the check-in/check-out flow and does NOT rewrite valid rows.

-- =============================================================================
-- 0) Shared updated_at trigger for HR/Payroll tables
-- =============================================================================
create or replace function public.hr_payroll_set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- 1) De-duplicate attendance_records by (employee_id, attendance_date)
--    Keep the "best" row: has check-out > more working minutes > most recently updated.
-- =============================================================================
do $$
declare
  v_dupes int;
begin
  -- Only run if the table exists
  if to_regclass('public.attendance_records') is null then
    raise notice 'SKIP dedupe — attendance_records does not exist';
    return;
  end if;

  create temporary table if not exists _att_keep on commit drop as
  select
    id,
    employee_id,
    attendance_date,
    first_value(id) over (
      partition by employee_id, attendance_date
      order by
        (check_out_time is not null) desc,
        coalesce(total_working_minutes, 0) desc,
        coalesce(updated_at, created_at) desc,
        created_at desc,
        id
    ) as keep_id
  from public.attendance_records
  where employee_id is not null and attendance_date is not null;

  select count(*) into v_dupes from _att_keep where id <> keep_id;

  if v_dupes > 0 then
    -- Re-point work_summaries from soon-to-be-deleted rows to the surviving row
    if to_regclass('public.work_summaries') is not null then
      update public.work_summaries ws
      set attendance_id = k.keep_id
      from _att_keep k
      where ws.attendance_id = k.id and k.id <> k.keep_id;
    end if;

    delete from public.attendance_records ar
    using _att_keep k
    where ar.id = k.id and k.id <> k.keep_id;

    raise notice 'Removed % duplicate attendance rows', v_dupes;
  else
    raise notice 'No duplicate attendance rows found';
  end if;
end $$;

-- Enforce one attendance row per employee per day going forward
create unique index if not exists attendance_records_employee_date_uidx
  on public.attendance_records (employee_id, attendance_date);

-- =============================================================================
-- 2) attendance_corrections — review / correction queue
-- =============================================================================
create table if not exists public.attendance_corrections (
  id uuid primary key default gen_random_uuid (),
  attendance_id uuid references public.attendance_records (id) on delete set null,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  attendance_date date not null,
  original_data jsonb not null default '{}'::jsonb,
  revised_data jsonb not null default '{}'::jsonb,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_remarks text,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index if not exists attendance_corrections_emp_date_idx
  on public.attendance_corrections (employee_id, attendance_date desc);
create index if not exists attendance_corrections_status_idx
  on public.attendance_corrections (status, created_at desc);
create index if not exists attendance_corrections_attendance_idx
  on public.attendance_corrections (attendance_id)
  where attendance_id is not null;

drop trigger if exists attendance_corrections_set_updated_at on public.attendance_corrections;
create trigger attendance_corrections_set_updated_at
before update on public.attendance_corrections
for each row
execute function public.hr_payroll_set_updated_at ();

grant select, insert, update, delete on table public.attendance_corrections to authenticated;
alter table public.attendance_corrections enable row level security;

-- Employees may read their own corrections; admins read all.
drop policy if exists attendance_corrections_select on public.attendance_corrections;
create policy attendance_corrections_select
on public.attendance_corrections
for select
to authenticated
using (employee_id = auth.uid () or public.is_admin ());

-- Employees may raise a correction request for their own attendance (pending only).
drop policy if exists attendance_corrections_employee_insert on public.attendance_corrections;
create policy attendance_corrections_employee_insert
on public.attendance_corrections
for insert
to authenticated
with check (employee_id = auth.uid () and status = 'pending');

-- Admins manage (approve/reject/apply) any correction.
drop policy if exists attendance_corrections_admin_all on public.attendance_corrections;
create policy attendance_corrections_admin_all
on public.attendance_corrections
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

-- =============================================================================
-- 3) Activate audit_logs (table already defined in schema.sql)
-- =============================================================================
do $$
begin
  if to_regclass('public.audit_logs') is null then
    raise notice 'SKIP audit_logs RLS — table missing (run schema.sql)';
    return;
  end if;

  execute 'grant select, insert on table public.audit_logs to authenticated';
  execute 'alter table public.audit_logs enable row level security';

  -- Admins can read the audit trail (app writes via service role, which bypasses RLS).
  execute 'drop policy if exists audit_logs_admin_read on public.audit_logs';
  execute 'create policy audit_logs_admin_read on public.audit_logs for select to authenticated using (public.is_admin ())';

  execute 'create index if not exists audit_logs_target_idx on public.audit_logs (target_table, target_id, created_at desc)';
  execute 'create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc)';
  execute 'create index if not exists audit_logs_module_idx on public.audit_logs (module, created_at desc)';
end $$;

-- Rollback:
--   drop table if exists public.attendance_corrections cascade;
--   drop index if exists public.attendance_records_employee_date_uidx;
--   (audit_logs policy/indexes can be dropped individually; leaving them is harmless.)
