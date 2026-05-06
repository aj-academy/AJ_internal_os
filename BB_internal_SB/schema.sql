create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  role text check (role in ('super_admin', 'admin', 'manager', 'employee', 'accounts')),
  department text,
  designation text,
  status text default 'active',
  created_at timestamp with time zone default now()
);

alter table public.profiles enable row level security;

create table if not exists public.employee_details (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.profiles(id) on delete cascade,
  manager_id uuid references public.profiles(id) on delete set null,
  employee_code text unique,
  phone text,
  joined_at date,
  created_at timestamptz default now()
);

alter table public.employee_details enable row level security;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  module text,
  target_table text,
  target_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz default now()
);

alter table public.audit_logs enable row level security;

create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text unique not null,
  setting_value jsonb,
  description text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now()
);

alter table public.system_settings enable row level security;

create or replace function public.get_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_user_role() in ('admin', 'super_admin'), false);
$$;
