-- Supabase-ready attendance schema for future integration
-- Uses public.profiles(id) as employee and approver references

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
