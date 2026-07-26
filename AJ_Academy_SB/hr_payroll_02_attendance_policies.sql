-- HR, Attendance & Payroll — Phase 2: effective-dated attendance policies
-- Safe to re-run. Depends on: schema.sql, attendance_module.sql, hr_payroll_01_attendance_integrity.sql
--
-- What it does:
--   1) Creates attendance_policies (company-wide, effective-dated).
--   2) Seeds one active policy from attendance_settings and/or system_settings.attendance when present.
--   3) RLS: admins manage; authenticated staff can read (needed for payroll/attendance derivation).
--
-- Policy changes do NOT rewrite historical attendance_records. Locked payroll (later) will
-- snapshot the policy id used at calculation time.

create table if not exists public.attendance_policies (
  id uuid primary key default gen_random_uuid (),
  name text not null default 'Default attendance policy',
  effective_from date not null,
  effective_to date,
  -- Office hours
  office_start_time time not null default '10:00',
  office_end_time time not null default '18:00',
  grace_minutes integer not null default 15 check (grace_minutes >= 0),
  -- Day thresholds (minutes)
  min_full_day_minutes integer not null default 480 check (min_full_day_minutes > 0),
  min_half_day_minutes integer not null default 240 check (min_half_day_minutes > 0),
  max_break_minutes integer not null default 60 check (max_break_minutes >= 0),
  -- Late / early / missing checkout
  late_arrival_rule text not null default 'mark_late'
    check (late_arrival_rule in ('mark_late', 'ignore', 'deduct_half_day', 'send_to_review')),
  early_exit_rule text not null default 'mark_early_exit'
    check (early_exit_rule in ('mark_early_exit', 'ignore', 'deduct_half_day', 'send_to_review')),
  missing_checkout_treatment text not null default 'send_to_review'
    check (missing_checkout_treatment in ('send_to_review', 'assume_standard_hours', 'mark_absent', 'mark_half_day')),
  -- Weekly off: 0=Sunday ... 6=Saturday (Postgres extract(dow from date))
  weekly_off_days integer[] not null default '{0}',
  -- Holiday / WFH / permission behaviour
  holiday_treatment text not null default 'paid_holiday'
    check (holiday_treatment in ('paid_holiday', 'unpaid', 'working_day')),
  wfh_policy text not null default 'allowed_with_approval'
    check (wfh_policy in ('allowed', 'allowed_with_approval', 'not_allowed')),
  permission_hour_policy text not null default 'track_only'
    check (permission_hour_policy in ('track_only', 'deduct_from_hours', 'send_to_review')),
  -- Overtime
  overtime_eligible boolean not null default false,
  overtime_min_minutes integer not null default 30 check (overtime_min_minutes >= 0),
  overtime_requires_approval boolean not null default true,
  -- Rounding & salary-day method (payroll uses these later)
  attendance_rounding_rule text not null default 'none'
    check (attendance_rounding_rule in ('none', 'nearest_15', 'nearest_30', 'ceil_15', 'floor_15')),
  salary_day_method text not null default 'fixed_30'
    check (salary_day_method in ('calendar_days', 'fixed_30', 'working_days', 'configured_days')),
  configured_payroll_days integer check (configured_payroll_days is null or configured_payroll_days > 0),
  -- Meta
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint attendance_policies_date_range_chk
    check (effective_to is null or effective_to >= effective_from),
  constraint attendance_policies_half_lte_full_chk
    check (min_half_day_minutes <= min_full_day_minutes)
);

create index if not exists attendance_policies_effective_idx
  on public.attendance_policies (effective_from desc, effective_to desc nulls first);

-- Only one open-ended (currently active) policy at a time
create unique index if not exists attendance_policies_one_open_uidx
  on public.attendance_policies ((true))
  where effective_to is null;

drop trigger if exists attendance_policies_set_updated_at on public.attendance_policies;
create trigger attendance_policies_set_updated_at
before update on public.attendance_policies
for each row
execute function public.hr_payroll_set_updated_at ();

grant select, insert, update, delete on table public.attendance_policies to authenticated;
alter table public.attendance_policies enable row level security;

drop policy if exists attendance_policies_select on public.attendance_policies;
create policy attendance_policies_select
on public.attendance_policies
for select
to authenticated
using (true);

drop policy if exists attendance_policies_admin_write on public.attendance_policies;
create policy attendance_policies_admin_write
on public.attendance_policies
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

-- =============================================================================
-- Seed one active policy if none exists (from attendance_settings / defaults)
-- =============================================================================
do $$
declare
  v_count int;
  v_start time := '10:00';
  v_end time := '18:00';
  v_late time := '10:15';
  v_half int := 240;
  v_grace int := 15;
  v_working text;
  v_weekly int[] := array[0];
  v_as record;
  v_sys jsonb;
begin
  select count(*) into v_count from public.attendance_policies;
  if v_count > 0 then
    raise notice 'attendance_policies already seeded (% rows) — skip', v_count;
    return;
  end if;

  -- Prefer attendance_settings row if present
  if to_regclass('public.attendance_settings') is not null then
    select * into v_as from public.attendance_settings order by created_at desc nulls last limit 1;
    if found then
      if v_as.standard_check_in_time is not null then v_start := v_as.standard_check_in_time; end if;
      if v_as.standard_check_out_time is not null then v_end := v_as.standard_check_out_time; end if;
      if v_as.late_after_time is not null then v_late := v_as.late_after_time; end if;
      if v_as.half_day_minimum_minutes is not null then v_half := v_as.half_day_minimum_minutes; end if;
    end if;
  end if;

  -- Overlay system_settings.attendance JSON if present
  if to_regclass('public.system_settings') is not null then
    select setting_value into v_sys
    from public.system_settings
    where setting_key = 'attendance'
    limit 1;

    if v_sys is not null then
      if v_sys ? 'officeStartTime' and nullif(v_sys->>'officeStartTime', '') is not null then
        v_start := (v_sys->>'officeStartTime')::time;
      end if;
      if v_sys ? 'officeEndTime' and nullif(v_sys->>'officeEndTime', '') is not null then
        v_end := (v_sys->>'officeEndTime')::time;
      end if;
      if v_sys ? 'graceMinutes' then
        begin
          v_grace := greatest(0, (v_sys->>'graceMinutes')::int);
        exception when others then
          null;
        end;
      end if;
      if v_sys ? 'workingDays' then
        v_working := lower(coalesce(v_sys->>'workingDays', ''));
        -- Invert: days NOT listed become weekly offs (0=Sun..6=Sat)
        v_weekly := array[]::integer[];
        if position('sun' in v_working) = 0 then v_weekly := array_append(v_weekly, 0); end if;
        if position('mon' in v_working) = 0 then v_weekly := array_append(v_weekly, 1); end if;
        if position('tue' in v_working) = 0 then v_weekly := array_append(v_weekly, 2); end if;
        if position('wed' in v_working) = 0 then v_weekly := array_append(v_weekly, 3); end if;
        if position('thu' in v_working) = 0 then v_weekly := array_append(v_weekly, 4); end if;
        if position('fri' in v_working) = 0 then v_weekly := array_append(v_weekly, 5); end if;
        if position('sat' in v_working) = 0 then v_weekly := array_append(v_weekly, 6); end if;
        if coalesce(array_length(v_weekly, 1), 0) = 0 then
          v_weekly := array[0]; -- fallback Sunday off
        end if;
      end if;
    end if;
  end if;

  -- Derive late_after from start + grace when late_after wasn't set from attendance_settings
  if v_late is null then
    v_late := (v_start + make_interval(mins => v_grace))::time;
  end if;

  insert into public.attendance_policies (
    name,
    effective_from,
    office_start_time,
    office_end_time,
    grace_minutes,
    min_full_day_minutes,
    min_half_day_minutes,
    weekly_off_days,
    notes
  ) values (
    'Default attendance policy',
    current_date,
    v_start,
    v_end,
    v_grace,
    greatest(480, v_half * 2),
    v_half,
    v_weekly,
    'Seeded from existing attendance_settings / system_settings.attendance (Phase 2).'
  );

  raise notice 'Seeded attendance_policies from existing settings';
end $$;

-- Helper: resolve the policy effective on a given date (SECURITY DEFINER not required —
-- RLS already allows authenticated SELECT).
create or replace function public.resolve_attendance_policy (p_date date default current_date)
returns public.attendance_policies
language sql
stable
as $$
  select *
  from public.attendance_policies
  where effective_from <= p_date
    and (effective_to is null or effective_to >= p_date)
  order by effective_from desc
  limit 1;
$$;

grant execute on function public.resolve_attendance_policy (date) to authenticated;

-- Rollback:
--   drop function if exists public.resolve_attendance_policy(date);
--   drop table if exists public.attendance_policies cascade;
