-- HR, Attendance & Payroll — Phase 14: idempotent automation jobs
-- Safe to re-run.
--
-- REQUIRED FIRST (in order) — do not run this file alone:
--   hr_payroll_01_attendance_integrity.sql
--   hr_payroll_02_attendance_policies.sql
--   hr_payroll_03_holidays.sql
--   hr_payroll_04_leave_management.sql
--   hr_payroll_05_salary_structures.sql
--   hr_payroll_06_payroll_settings.sql
--   hr_payroll_07_payroll_engine.sql      ← creates public.payroll_periods
--   hr_payroll_08_10_workflow_adjustments.sql
--   hr_payroll_11_13_payslips_queries.sql
-- Then this file.
--
-- Jobs are claimed by unique idempotency_key so daily cron / manual re-runs are safe.

do $$
begin
  if to_regclass('public.payroll_periods') is null then
    raise exception
      'public.payroll_periods does not exist. Run hr_payroll_01 … hr_payroll_07_payroll_engine.sql (then 08_10 and 11_13) before hr_payroll_14_automation.sql. See AJ_Academy_SB/DATABASE_SETUP_ORDER.txt.';
  end if;
  if to_regprocedure('public.hr_payroll_set_updated_at()') is null then
    raise exception
      'public.hr_payroll_set_updated_at() is missing. Run hr_payroll_01_attendance_integrity.sql first.';
  end if;
end $$;

create table if not exists public.payroll_automation_jobs (
  id uuid primary key default gen_random_uuid (),
  job_type text not null
    check (job_type in (
      'attendance_cutoff_reminder',
      'leave_cutoff_reminder',
      'adjustment_cutoff_reminder',
      'auto_generate_payslips',
      'notify_payslip_release',
      'payroll_pending_review_nudge'
    )),
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  payroll_period_id uuid references public.payroll_periods (id) on delete set null,
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'processed', 'failed', 'skipped')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  unique (idempotency_key)
);

create index if not exists payroll_automation_jobs_pending_idx
  on public.payroll_automation_jobs (status, created_at)
  where status = 'pending';

create index if not exists payroll_automation_jobs_period_idx
  on public.payroll_automation_jobs (year, month, job_type);

drop trigger if exists payroll_automation_jobs_set_updated_at on public.payroll_automation_jobs;
create trigger payroll_automation_jobs_set_updated_at
before update on public.payroll_automation_jobs
for each row
execute function public.hr_payroll_set_updated_at ();

grant select, insert, update, delete on table public.payroll_automation_jobs to authenticated;

alter table public.payroll_automation_jobs enable row level security;

drop policy if exists payroll_automation_jobs_admin_all on public.payroll_automation_jobs;
create policy payroll_automation_jobs_admin_all
on public.payroll_automation_jobs
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

-- Rollback:
--   drop table if exists public.payroll_automation_jobs cascade;
