-- BB Internal OS — Task assignment (public.tasks)
-- Run after schema.sql (profiles) so assigned_to references exist.
-- Path in repo: BB_internal_SB/task_schema.sql

create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to uuid not null references public.profiles(id),
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High')),
  status text not null default 'Pending' check (status in ('Pending', 'In Progress', 'Completed')),
  start_date date,
  due_date date,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_assigned_to_idx on public.tasks(assigned_to);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists tasks_priority_idx on public.tasks(priority);
create index if not exists tasks_due_date_idx on public.tasks(due_date);

create or replace function public.tasks_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at_trigger on public.tasks;
create trigger tasks_set_updated_at_trigger
before update on public.tasks
for each row
execute function public.tasks_set_updated_at();

alter table public.tasks enable row level security;

drop policy if exists "tasks_admin_select_all" on public.tasks;
create policy "tasks_admin_select_all"
on public.tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists "tasks_admin_insert_all" on public.tasks;
create policy "tasks_admin_insert_all"
on public.tasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists "tasks_admin_update_all" on public.tasks;
create policy "tasks_admin_update_all"
on public.tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists "tasks_admin_delete_all" on public.tasks;
create policy "tasks_admin_delete_all"
on public.tasks
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists "tasks_employee_select_assigned" on public.tasks;
create policy "tasks_employee_select_assigned"
on public.tasks
for select
to authenticated
using (assigned_to = auth.uid());

drop policy if exists "tasks_employee_update_status_progress" on public.tasks;
create policy "tasks_employee_update_status_progress"
on public.tasks
for update
to authenticated
using (assigned_to = auth.uid())
with check (assigned_to = auth.uid());

-- Managers: read all tasks (team visibility; same pattern as CRM)
drop policy if exists "tasks_manager_select_all" on public.tasks;
create policy "tasks_manager_select_all"
on public.tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'manager'
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end
$$;
