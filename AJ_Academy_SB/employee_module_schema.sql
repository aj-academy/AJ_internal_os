-- AJ Academy — employee panel (permission columns, leave_requests for My Leave)
-- Run after attendance_module.sql. Safe to re-run.

alter table public.permission_requests
  add column if not exists permission_type text,
  add column if not exists approved_at timestamptz,
  add column if not exists rejection_reason text;

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

grant select, insert, update, delete on table public.leave_requests to authenticated;
alter table public.leave_requests enable row level security;

drop policy if exists leave_own_all on public.leave_requests;
create policy leave_own_all on public.leave_requests for all to authenticated
using (employee_id = auth.uid()) with check (employee_id = auth.uid());

drop policy if exists leave_admin_all on public.leave_requests;
create policy leave_admin_all on public.leave_requests for all to authenticated
using (public.is_admin()) with check (public.is_admin());
