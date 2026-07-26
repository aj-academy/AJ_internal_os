-- HR, Attendance & Payroll — Phases 8–10: workflow columns + salary adjustments
-- Safe to re-run. Depends on: hr_payroll_07_payroll_engine.sql
--
-- Phase 8/10: workflow actor/timestamp/reason columns on payroll_periods.
-- Phase 9: salary_adjustments (approval-gated; only approved rows affect calculation).

-- =============================================================================
-- 1) Workflow columns on payroll_periods
-- =============================================================================
alter table public.payroll_periods
  add column if not exists approved_by uuid references public.profiles (id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists locked_by uuid references public.profiles (id) on delete set null,
  add column if not exists locked_at timestamptz,
  add column if not exists reopened_by uuid references public.profiles (id) on delete set null,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopen_reason text,
  add column if not exists paid_by uuid references public.profiles (id) on delete set null,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_reference text,
  add column if not exists status_reason text;

-- =============================================================================
-- 2) salary_adjustments
-- =============================================================================
create table if not exists public.salary_adjustments (
  id uuid primary key default gen_random_uuid (),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  payroll_period_id uuid references public.payroll_periods (id) on delete set null,
  -- When period is not yet created, target by year/month
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  adjustment_type text not null
    check (adjustment_type in (
      'performance_incentive', 'sales_incentive', 'bonus', 'overtime', 'arrears',
      'travel_reimbursement', 'food_reimbursement', 'other_reimbursement', 'other_addition',
      'salary_advance', 'loan_recovery', 'penalty', 'attendance_deduction',
      'asset_recovery', 'other_deduction'
    )),
  direction text not null check (direction in ('addition', 'deduction')),
  amount numeric(14, 2) not null check (amount > 0),
  reason text not null,
  supporting_document_url text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  review_remarks text,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index if not exists salary_adjustments_period_idx
  on public.salary_adjustments (year, month, status);
create index if not exists salary_adjustments_employee_idx
  on public.salary_adjustments (employee_id, year desc, month desc);
create index if not exists salary_adjustments_period_id_idx
  on public.salary_adjustments (payroll_period_id)
  where payroll_period_id is not null;

drop trigger if exists salary_adjustments_set_updated_at on public.salary_adjustments;
create trigger salary_adjustments_set_updated_at
before update on public.salary_adjustments
for each row
execute function public.hr_payroll_set_updated_at ();

grant select, insert, update, delete on table public.salary_adjustments to authenticated;
alter table public.salary_adjustments enable row level security;

-- Employees can read their own approved adjustments (for payslip transparency later);
-- admins manage all.
drop policy if exists salary_adjustments_select on public.salary_adjustments;
create policy salary_adjustments_select
on public.salary_adjustments
for select
to authenticated
using (
  public.is_admin ()
  or (employee_id = auth.uid () and status = 'approved')
);

drop policy if exists salary_adjustments_admin_all on public.salary_adjustments;
create policy salary_adjustments_admin_all
on public.salary_adjustments
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

-- Rollback:
--   drop table if exists public.salary_adjustments cascade;
--   alter table public.payroll_periods
--     drop column if exists approved_by, drop column if exists approved_at,
--     drop column if exists locked_by, drop column if exists locked_at,
--     drop column if exists reopened_by, drop column if exists reopened_at,
--     drop column if exists reopen_reason, drop column if exists paid_by,
--     drop column if exists paid_at, drop column if exists payment_reference,
--     drop column if exists status_reason;
