-- Freelancer: assign tasks to students in the same department (same rules as mentor).
-- Run after mentor_department_tasks.sql (or instead if mentor script not run yet).

create or replace function public.is_department_task_assigner_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(btrim(coalesce(public.get_user_role(), ''))) in ('mentor', 'freelancer');
$$;

grant execute on function public.is_department_task_assigner_role() to authenticated;

-- Students in assigner's department (mentor + freelancer assignee picker)
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
    and public.is_department_task_assigner_role()
    and lower(coalesce(p.status, 'active')) = 'active'
    and lower(coalesce(p.role, '')) = 'student'
  order by p.full_name nulls last;
$$;

grant execute on function public.get_department_task_assignees() to authenticated;

drop policy if exists "tasks_freelancer_select_assigned" on public.tasks;
create policy "tasks_freelancer_select_assigned"
on public.tasks for select to authenticated
using (
  lower(btrim(coalesce(public.get_user_role(), ''))) = 'freelancer'
  and assigned_by = auth.uid()
);

drop policy if exists "tasks_freelancer_insert_department" on public.tasks;
create policy "tasks_freelancer_insert_department"
on public.tasks for insert to authenticated
with check (
  lower(btrim(coalesce(public.get_user_role(), ''))) = 'freelancer'
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

drop policy if exists "tasks_freelancer_update_assigned" on public.tasks;
create policy "tasks_freelancer_update_assigned"
on public.tasks for update to authenticated
using (
  lower(btrim(coalesce(public.get_user_role(), ''))) = 'freelancer'
  and assigned_by = auth.uid()
)
with check (
  lower(btrim(coalesce(public.get_user_role(), ''))) = 'freelancer'
  and assigned_by = auth.uid()
);

drop policy if exists "tasks_freelancer_delete_assigned" on public.tasks;
create policy "tasks_freelancer_delete_assigned"
on public.tasks for delete to authenticated
using (
  lower(btrim(coalesce(public.get_user_role(), ''))) = 'freelancer'
  and assigned_by = auth.uid()
);
