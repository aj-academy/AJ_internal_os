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

-- Employees: assign to self, same-department peers, or shared project team (see tasks_employee_may_assign_to)
create or replace function public.tasks_employee_may_assign_to (actor uuid, assignee uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_ptm boolean;
  v_me_dept text;
  v_assignee_dept text;
begin
  if actor is null or assignee is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.profiles me
    where me.id = actor
      and lower(coalesce(me.role, '')) = 'employee'
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from public.profiles a
    where a.id = assignee
      and coalesce(lower(a.status), 'active') = 'active'
      and lower(coalesce(a.role, '')) in ('employee', 'manager')
  ) then
    return false;
  end if;

  if actor = assignee then
    return true;
  end if;

  select nullif(trim(department), '')
  into v_me_dept
  from public.profiles
  where id = actor;

  select nullif(trim(department), '')
  into v_assignee_dept
  from public.profiles
  where id = assignee;

  if v_me_dept is not null and v_assignee_dept is not null and lower(v_me_dept) = lower(v_assignee_dept) then
    return true;
  end if;

  select to_regclass('public.project_team_members') is not null into v_has_ptm;

  if v_has_ptm then
    return exists (
      select 1
      from public.project_team_members a
      join public.project_team_members b on b.project_id = a.project_id and b.profile_id = assignee
      where a.profile_id = actor
    );
  end if;

  return false;
end;
$$;

drop policy if exists "tasks_employee_insert_self" on public.tasks;
drop policy if exists "tasks_employee_insert_delegated" on public.tasks;
create policy "tasks_employee_insert_delegated"
on public.tasks
for insert
to authenticated
with check (public.tasks_employee_may_assign_to(auth.uid(), assigned_to));

-- Team assignee picker for employees (bypasses profiles RLS safely)
drop function if exists public.get_team_assignees ();

create or replace function public.get_team_assignees ()
returns table (
  id uuid,
  full_name text,
  email text,
  department text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select p.id, p.full_name, p.email, p.department
  from public.profiles p
  where
    exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and lower(coalesce(me.role, '')) = 'employee'
    )
    and coalesce(lower(p.status), 'active') = 'active'
    and lower(coalesce(p.role, '')) in ('employee', 'manager', 'admin', 'super_admin')
    and p.id <> auth.uid()
  order by p.full_name nulls last, p.email nulls last;
end;
$$;

grant execute on function public.get_team_assignees () to authenticated;

-- Admin / manager assignee picker (real profiles; bypasses narrow client RLS on profiles)
drop function if exists public.get_task_assignees ();

create or replace function public.get_task_assignees ()
returns table (
  id uuid,
  full_name text,
  email text,
  department text,
  role text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin', 'manager')
  ) then
    return;
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.email,
    p.department,
    p.role
  from public.profiles p
  where
    lower(coalesce(p.role, '')) in ('employee', 'manager', 'admin', 'super_admin')
    and (p.status is null or lower(trim(p.status)) = 'active')
  order by p.full_name nulls last, p.email nulls last;
end;
$$;

grant execute on function public.get_task_assignees () to authenticated;

-- Managers: create / update / delete tasks (same scope as admin for operations)
drop policy if exists "tasks_manager_insert_all" on public.tasks;
create policy "tasks_manager_insert_all"
on public.tasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'manager'
  )
);

drop policy if exists "tasks_manager_update_all" on public.tasks;
create policy "tasks_manager_update_all"
on public.tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'manager'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'manager'
  )
);

drop policy if exists "tasks_manager_delete_all" on public.tasks;
create policy "tasks_manager_delete_all"
on public.tasks
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) = 'manager'
  )
);

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
