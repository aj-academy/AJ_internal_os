-- HR, Attendance & Payroll — Phase 6: payroll settings (company + period rules)
-- Safe to re-run. Depends on: hr_payroll_01..05
--
-- Effective-dated payroll settings. Company branding is configurable (defaults to
-- "AJ Academy" / existing system_settings.company when available).
-- Statutory deductions are configurable and DEFAULT OFF / "not_verified".

create table if not exists public.payroll_settings (
  id uuid primary key default gen_random_uuid (),
  name text not null default 'Default payroll settings',
  effective_from date not null,
  effective_to date,
  -- Company branding on payslips (configurable — never hardcoded AchieversJournal)
  company_name text not null default 'AJ Academy',
  company_address text,
  company_logo_url text,
  currency text not null default 'INR',
  -- Period / payment
  period_start_day integer not null default 1 check (period_start_day between 1 and 28),
  salary_payment_day integer not null default 1 check (salary_payment_day between 1 and 28),
  salary_day_method text not null default 'fixed_30'
    check (salary_day_method in ('calendar_days', 'fixed_30', 'working_days', 'configured_days')),
  configured_payroll_days integer check (configured_payroll_days is null or configured_payroll_days > 0),
  rounding_method text not null default 'nearest_rupee'
    check (rounding_method in ('none', 'nearest_rupee', 'floor_rupee', 'ceil_rupee')),
  -- Cut-offs (day of month; 0 = end of period)
  attendance_cutoff_day integer not null default 0 check (attendance_cutoff_day between 0 and 28),
  leave_cutoff_day integer not null default 0 check (leave_cutoff_day between 0 and 28),
  adjustment_cutoff_day integer not null default 0 check (adjustment_cutoff_day between 0 and 28),
  -- Payslip
  payslip_number_prefix text not null default 'PSL',
  payslip_number_format text not null default '{PREFIX}-{YYYY}{MM}-{SEQ4}',
  -- Workflow / release
  require_attendance_review_clearance boolean not null default true,
  auto_release_payslips_on_lock boolean not null default false,
  notify_employees_on_release boolean not null default true,
  -- Statutory (configurable; default OFF and unverified — Phase 28)
  statutory_enabled boolean not null default false,
  statutory_label text not null default 'not_verified',
  statutory_rules jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint payroll_settings_date_range_chk
    check (effective_to is null or effective_to >= effective_from)
);

create index if not exists payroll_settings_effective_idx
  on public.payroll_settings (effective_from desc);

create unique index if not exists payroll_settings_one_open_uidx
  on public.payroll_settings ((true))
  where effective_to is null;

drop trigger if exists payroll_settings_set_updated_at on public.payroll_settings;
create trigger payroll_settings_set_updated_at
before update on public.payroll_settings
for each row
execute function public.hr_payroll_set_updated_at ();

grant select, insert, update, delete on table public.payroll_settings to authenticated;
alter table public.payroll_settings enable row level security;

drop policy if exists payroll_settings_select on public.payroll_settings;
create policy payroll_settings_select
on public.payroll_settings
for select
to authenticated
using (public.is_admin () or true); -- employees may read company branding for their payslips later

drop policy if exists payroll_settings_admin_write on public.payroll_settings;
create policy payroll_settings_admin_write
on public.payroll_settings
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

-- Seed one open settings row from system_settings.company when available
do $$
declare
  v_count int;
  v_name text := 'AJ Academy';
  v_address text := null;
  v_logo text := null;
  v_currency text := 'INR';
  v_sys jsonb;
begin
  select count(*) into v_count from public.payroll_settings;
  if v_count > 0 then
    raise notice 'payroll_settings already seeded — skip';
    return;
  end if;

  if to_regclass('public.system_settings') is not null then
    select setting_value into v_sys
    from public.system_settings
    where setting_key = 'company'
    limit 1;
    if v_sys is not null then
      if nullif(v_sys->>'companyName', '') is not null then v_name := v_sys->>'companyName'; end if;
      if nullif(v_sys->>'address', '') is not null then v_address := v_sys->>'address'; end if;
      if nullif(v_sys->>'logoUrl', '') is not null then v_logo := v_sys->>'logoUrl'; end if;
      if nullif(v_sys->>'currency', '') is not null then v_currency := v_sys->>'currency'; end if;
    end if;
  end if;

  insert into public.payroll_settings (
    name, effective_from, company_name, company_address, company_logo_url, currency, notes
  ) values (
    'Default payroll settings',
    current_date,
    v_name,
    v_address,
    v_logo,
    v_currency,
    'Seeded from system_settings.company. Statutory deductions default OFF / not_verified.'
  );
end $$;

create or replace function public.resolve_payroll_settings (p_date date default current_date)
returns public.payroll_settings
language sql
stable
as $$
  select *
  from public.payroll_settings
  where effective_from <= p_date
    and (effective_to is null or effective_to >= p_date)
  order by effective_from desc
  limit 1;
$$;

grant execute on function public.resolve_payroll_settings (date) to authenticated;

-- Rollback:
--   drop function if exists public.resolve_payroll_settings(date);
--   drop table if exists public.payroll_settings cascade;
