-- AJ Academy — run after task_schema.sql and attendance_module.sql on a NEW Supabase project
-- Maps legacy "employee/manager" task rules to student / freelancer / mentor

create or replace function public.is_member_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    lower(btrim(coalesce(public.get_user_role(), ''))) in ('student', 'freelancer', 'mentor'),
    false
  );
$$;

drop policy if exists "tasks_employee_select_assigned" on public.tasks;
create policy "tasks_member_select_assigned"
on public.tasks for select to authenticated
using (
  assigned_to = auth.uid()
  and public.is_member_role()
);

drop policy if exists "tasks_employee_update_status_progress" on public.tasks;
create policy "tasks_member_update_status_progress"
on public.tasks for update to authenticated
using (assigned_to = auth.uid() and public.is_member_role())
with check (assigned_to = auth.uid() and public.is_member_role());

-- Admin assignee picker: students, freelancers, mentors
create or replace function public.get_task_assignees()
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
  from public.profiles p
  where lower(coalesce(p.status, 'active')) = 'active'
    and lower(coalesce(p.role, '')) in (
      'student', 'freelancer', 'mentor', 'admin', 'super_admin'
    )
  order by p.full_name nulls last;
$$;
