-- Mentor: assign tasks only to students in the same department; view tasks they assigned.
-- Run after aj_academy_roles_patch.sql

create or replace function public.is_mentor_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(btrim(coalesce(public.get_user_role(), ''))) = 'mentor';
$$;

-- Students in the mentor's department (for assignee picker)
create or replace function public.get_department_task_assignees()
returns table (
  id uuid,
  full_name text,
  email text,
  department text,
  role text
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.id, p.full_name, p.email, p.department, p.role
  from public.profiles me
  join public.profiles p
    on lower(btrim(coalesce(p.department, ''))) = lower(btrim(coalesce(me.department, '')))
    and btrim(coalesce(p.department, '')) <> ''
  where me.id = auth.uid()
    and public.is_mentor_role()
    and lower(coalesce(p.status, 'active')) = 'active'
    and lower(coalesce(p.role, '')) = 'student'
  order by p.full_name nulls last;
$$;

grant execute on function public.get_department_task_assignees() to authenticated;

drop policy if exists "tasks_mentor_select_assigned" on public.tasks;
create policy "tasks_mentor_select_assigned"
on public.tasks for select to authenticated
using (
  public.is_mentor_role()
  and assigned_by = auth.uid()
);

drop policy if exists "tasks_mentor_insert_department" on public.tasks;
create policy "tasks_mentor_insert_department"
on public.tasks for insert to authenticated
with check (
  public.is_mentor_role()
  and assigned_by = auth.uid()
  and assigned_to is not null
  and exists (
    select 1
    from public.profiles me
    join public.profiles student on student.id = assigned_to
    where me.id = auth.uid()
      and lower(coalesce(student.role, '')) = 'student'
      and lower(btrim(coalesce(student.department, ''))) = lower(btrim(coalesce(me.department, '')))
      and btrim(coalesce(me.department, '')) <> ''
  )
);

drop policy if exists "tasks_mentor_update_assigned" on public.tasks;
create policy "tasks_mentor_update_assigned"
on public.tasks for update to authenticated
using (public.is_mentor_role() and assigned_by = auth.uid())
with check (public.is_mentor_role() and assigned_by = auth.uid());

drop policy if exists "tasks_mentor_delete_assigned" on public.tasks;
create policy "tasks_mentor_delete_assigned"
on public.tasks for delete to authenticated
using (public.is_mentor_role() and assigned_by = auth.uid());
