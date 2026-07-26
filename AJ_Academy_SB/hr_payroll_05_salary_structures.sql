-- HR, Attendance & Payroll — Phase 5: employee salary structures + UAN/ESI
-- Safe to re-run. Depends on: schema.sql, employee_profile_self_service_schema.sql (optional for UAN/ESI),
--                            hr_payroll_01_attendance_integrity.sql
--
-- Effective-dated salary structures. Publishing a new version closes the previous open row.
-- Historical payroll (later) resolves structures by date — never overwrite locked results.

-- =============================================================================
-- 1) UAN / ESI on employee_profile_details (additive; skip if table missing)
-- =============================================================================
do $$
begin
  if to_regclass('public.employee_profile_details') is not null then
    alter table public.employee_profile_details
      add column if not exists uan_number text,
      add column if not exists esi_number text;
  else
    raise notice 'SKIP UAN/ESI columns — employee_profile_details not present';
  end if;
end $$;

-- =============================================================================
-- 2) employee_salary_structures
-- =============================================================================
create table if not exists public.employee_salary_structures (
  id uuid primary key default gen_random_uuid (),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  salary_type text not null default 'monthly'
    check (salary_type in (
      'monthly', 'daily', 'hourly', 'intern_stipend', 'consultant', 'commission'
    )),
  payroll_status text not null default 'active'
    check (payroll_status in ('active', 'excluded', 'on_hold')),
  effective_from date not null,
  effective_to date,
  currency text not null default 'INR',
  -- Amounts (monthly basis for salary_type = monthly; daily/hourly use their rate fields)
  monthly_gross numeric(14, 2) not null default 0 check (monthly_gross >= 0),
  annual_ctc numeric(14, 2),
  basic_salary numeric(14, 2) not null default 0 check (basic_salary >= 0),
  hra numeric(14, 2) not null default 0 check (hra >= 0),
  special_allowance numeric(14, 2) not null default 0 check (special_allowance >= 0),
  travel_allowance numeric(14, 2) not null default 0 check (travel_allowance >= 0),
  communication_allowance numeric(14, 2) not null default 0 check (communication_allowance >= 0),
  incentive numeric(14, 2) not null default 0 check (incentive >= 0),
  other_allowances numeric(14, 2) not null default 0 check (other_allowances >= 0),
  fixed_deductions numeric(14, 2) not null default 0 check (fixed_deductions >= 0),
  -- Rate fields for non-monthly types
  daily_rate numeric(14, 2),
  hourly_rate numeric(14, 2),
  -- Meta
  change_reason text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint employee_salary_structures_date_range_chk
    check (effective_to is null or effective_to >= effective_from)
);

create index if not exists employee_salary_structures_emp_idx
  on public.employee_salary_structures (employee_id, effective_from desc);

-- At most one open-ended structure per employee
create unique index if not exists employee_salary_structures_one_open_uidx
  on public.employee_salary_structures (employee_id)
  where effective_to is null;

drop trigger if exists employee_salary_structures_set_updated_at on public.employee_salary_structures;
create trigger employee_salary_structures_set_updated_at
before update on public.employee_salary_structures
for each row
execute function public.hr_payroll_set_updated_at ();

grant select, insert, update, delete on table public.employee_salary_structures to authenticated;
alter table public.employee_salary_structures enable row level security;

-- Employees may read their own structure; admins manage all.
drop policy if exists employee_salary_structures_select on public.employee_salary_structures;
create policy employee_salary_structures_select
on public.employee_salary_structures
for select
to authenticated
using (employee_id = auth.uid () or public.is_admin ());

drop policy if exists employee_salary_structures_admin_write on public.employee_salary_structures;
create policy employee_salary_structures_admin_write
on public.employee_salary_structures
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

create or replace function public.resolve_employee_salary_structure (
  p_employee_id uuid,
  p_date date default current_date
)
returns public.employee_salary_structures
language sql
stable
as $$
  select *
  from public.employee_salary_structures
  where employee_id = p_employee_id
    and effective_from <= p_date
    and (effective_to is null or effective_to >= p_date)
    and payroll_status = 'active'
  order by effective_from desc
  limit 1;
$$;

grant execute on function public.resolve_employee_salary_structure (uuid, date) to authenticated;

-- Rollback:
--   drop function if exists public.resolve_employee_salary_structure(uuid, date);
--   drop table if exists public.employee_salary_structures cascade;
--   alter table public.employee_profile_details drop column if exists uan_number;
--   alter table public.employee_profile_details drop column if exists esi_number;
