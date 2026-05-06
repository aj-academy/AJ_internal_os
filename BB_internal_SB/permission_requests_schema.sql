create extension if not exists pgcrypto;

create table if not exists public.permission_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  permission_date date not null,
  from_time time,
  to_time time,
  permission_type text,
  reason text,
  description text,
  status text not null default 'pending',
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists permission_requests_employee_id_idx on public.permission_requests(employee_id);
create index if not exists permission_requests_permission_date_idx on public.permission_requests(permission_date);
create index if not exists permission_requests_status_idx on public.permission_requests(status);

create or replace function public.permission_requests_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists permission_requests_set_updated_at_trigger on public.permission_requests;
create trigger permission_requests_set_updated_at_trigger
before update on public.permission_requests
for each row
execute function public.permission_requests_set_updated_at();

alter table public.permission_requests enable row level security;

drop policy if exists "permission_employee_insert_own" on public.permission_requests;
create policy "permission_employee_insert_own"
on public.permission_requests
for insert
to authenticated
with check (auth.uid() = employee_id);

drop policy if exists "permission_employee_select_own" on public.permission_requests;
create policy "permission_employee_select_own"
on public.permission_requests
for select
to authenticated
using (auth.uid() = employee_id);

drop policy if exists "permission_employee_update_pending_own" on public.permission_requests;
create policy "permission_employee_update_pending_own"
on public.permission_requests
for update
to authenticated
using (auth.uid() = employee_id and status = 'pending')
with check (auth.uid() = employee_id and status = 'pending');

drop policy if exists "permission_admin_select_all" on public.permission_requests;
create policy "permission_admin_select_all"
on public.permission_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  )
);

drop policy if exists "permission_admin_update_all" on public.permission_requests;
create policy "permission_admin_update_all"
on public.permission_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  )
);
