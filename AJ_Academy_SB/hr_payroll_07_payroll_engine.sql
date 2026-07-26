-- HR, Attendance & Payroll — Phase 7: payroll periods + items (calculation engine storage)
-- Safe to re-run. Depends on: hr_payroll_01..06
--
-- Calculation results are stored with full input/policy snapshots so locked payroll
-- remains reproducible even if attendance or policies change later.
-- Full status workflow (approve/lock/paid) is completed in Phase 8; Phase 7 supports
-- draft → calculated (and recalculate while unlocked).

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid (),
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft'
    check (status in (
      'draft', 'attendance_review', 'pending_adjustments', 'calculated',
      'pending_review', 'approved', 'locked', 'paid', 'reopened', 'cancelled'
    )),
  payroll_settings_id uuid references public.payroll_settings (id) on delete set null,
  attendance_policy_id uuid references public.attendance_policies (id) on delete set null,
  settings_snapshot jsonb not null default '{}'::jsonb,
  policy_snapshot jsonb not null default '{}'::jsonb,
  calculation_version integer not null default 1,
  calculated_at timestamptz,
  calculated_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  unique (year, month),
  constraint payroll_periods_range_chk check (period_end >= period_start)
);

create index if not exists payroll_periods_status_idx
  on public.payroll_periods (status, year desc, month desc);

drop trigger if exists payroll_periods_set_updated_at on public.payroll_periods;
create trigger payroll_periods_set_updated_at
before update on public.payroll_periods
for each row
execute function public.hr_payroll_set_updated_at ();

create table if not exists public.payroll_items (
  id uuid primary key default gen_random_uuid (),
  payroll_period_id uuid not null references public.payroll_periods (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  salary_structure_id uuid references public.employee_salary_structures (id) on delete set null,
  -- Attendance totals
  calendar_days integer not null default 0,
  working_days integer not null default 0,
  weekly_offs integer not null default 0,
  holidays integer not null default 0,
  present_days numeric(6, 2) not null default 0,
  paid_leave_days numeric(6, 2) not null default 0,
  unpaid_leave_days numeric(6, 2) not null default 0,
  half_days numeric(6, 2) not null default 0,
  absent_days numeric(6, 2) not null default 0,
  missing_attendance_days integer not null default 0,
  payable_days numeric(8, 2) not null default 0,
  overtime_hours numeric(8, 2) not null default 0,
  -- Earnings
  earned_basic numeric(14, 2) not null default 0,
  earned_hra numeric(14, 2) not null default 0,
  earned_allowances numeric(14, 2) not null default 0,
  incentives numeric(14, 2) not null default 0,
  bonus numeric(14, 2) not null default 0,
  overtime_amount numeric(14, 2) not null default 0,
  reimbursements numeric(14, 2) not null default 0,
  arrears numeric(14, 2) not null default 0,
  other_earnings numeric(14, 2) not null default 0,
  gross_earnings numeric(14, 2) not null default 0,
  -- Deductions
  loss_of_pay numeric(14, 2) not null default 0,
  absence_deduction numeric(14, 2) not null default 0,
  late_deduction numeric(14, 2) not null default 0,
  early_exit_deduction numeric(14, 2) not null default 0,
  fixed_deductions numeric(14, 2) not null default 0,
  advance_recovery numeric(14, 2) not null default 0,
  loan_recovery numeric(14, 2) not null default 0,
  penalty numeric(14, 2) not null default 0,
  statutory_deductions numeric(14, 2) not null default 0,
  other_deductions numeric(14, 2) not null default 0,
  total_deductions numeric(14, 2) not null default 0,
  -- Final
  net_salary numeric(14, 2) not null default 0,
  -- Reproducibility
  input_snapshot jsonb not null default '{}'::jsonb,
  component_breakdown jsonb not null default '{}'::jsonb,
  calculation_version integer not null default 1,
  calculation_errors jsonb not null default '[]'::jsonb,
  status text not null default 'calculated'
    check (status in ('excluded', 'error', 'calculated', 'approved', 'locked', 'paid')),
  error_message text,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  unique (payroll_period_id, employee_id)
);

create index if not exists payroll_items_period_idx on public.payroll_items (payroll_period_id);
create index if not exists payroll_items_employee_idx on public.payroll_items (employee_id, payroll_period_id);

drop trigger if exists payroll_items_set_updated_at on public.payroll_items;
create trigger payroll_items_set_updated_at
before update on public.payroll_items
for each row
execute function public.hr_payroll_set_updated_at ();

grant select, insert, update, delete on table public.payroll_periods to authenticated;
grant select, insert, update, delete on table public.payroll_items to authenticated;

alter table public.payroll_periods enable row level security;
alter table public.payroll_items enable row level security;

-- Periods: admin only (employees never see payroll runs)
drop policy if exists payroll_periods_admin_all on public.payroll_periods;
create policy payroll_periods_admin_all
on public.payroll_periods
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

-- Items: employees may read their own calculated/approved/locked/paid rows; admins all
drop policy if exists payroll_items_select on public.payroll_items;
create policy payroll_items_select
on public.payroll_items
for select
to authenticated
using (
  public.is_admin ()
  or (employee_id = auth.uid () and status in ('calculated', 'approved', 'locked', 'paid'))
);

drop policy if exists payroll_items_admin_write on public.payroll_items;
create policy payroll_items_admin_write
on public.payroll_items
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

-- Rollback:
--   drop table if exists public.payroll_items cascade;
--   drop table if exists public.payroll_periods cascade;
