-- Supabase-ready Employee Master schema
-- Supports admin add/edit/view with role mapping, department, designation, manager and status.

create extension if not exists pgcrypto;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text unique,
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists public.designations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  department_id uuid references public.departments(id),
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists public.employee_master (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  employee_code text not null unique,
  role text not null check (role in ('super_admin', 'admin', 'manager', 'employee', 'accounts')),
  department_id uuid references public.departments(id),
  designation_id uuid references public.designations(id),
  reporting_manager_profile_id uuid references public.profiles(id),
  status text not null default 'active' check (status in ('active', 'inactive')),
  joined_on date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_employee_master_profile_id on public.employee_master(profile_id);
create index if not exists idx_employee_master_reporting_manager_profile_id on public.employee_master(reporting_manager_profile_id);
create index if not exists idx_employee_master_department_id on public.employee_master(department_id);
create index if not exists idx_employee_master_designation_id on public.employee_master(designation_id);
create index if not exists idx_employee_master_status on public.employee_master(status);

