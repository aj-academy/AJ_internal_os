-- Restore employee task RLS (aj_academy_roles_patch replaced employee policies with member-only rules)
-- Run after task_schema.sql, aj_academy_roles_patch.sql, employee_student_master_rls.sql (is_employee)
-- Safe to re-run.

-- Assignee: tasks assigned to this employee
drop policy if exists tasks_employee_select_assigned on public.tasks;
drop policy if exists "tasks_employee_select_assigned" on public.tasks;
create policy tasks_employee_select_assigned
on public.tasks for select to authenticated
using (public.is_employee() and assigned_to = auth.uid());

-- Delegator: tasks this employee created / assigned to others ("Tasks I assigned" tab)
drop policy if exists tasks_employee_select_delegated on public.tasks;
create policy tasks_employee_select_delegated
on public.tasks for select to authenticated
using (public.is_employee() and assigned_by = auth.uid());

-- Assignee can update status / progress on own tasks
drop policy if exists tasks_employee_update_status_progress on public.tasks;
drop policy if exists "tasks_employee_update_status_progress" on public.tasks;
create policy tasks_employee_update_status_progress
on public.tasks for update to authenticated
using (public.is_employee() and assigned_to = auth.uid())
with check (public.is_employee() and assigned_to = auth.uid());

-- Ensure delegated insert still available (employee assigns to peer)
drop policy if exists tasks_employee_insert_delegated on public.tasks;
drop policy if exists "tasks_employee_insert_delegated" on public.tasks;
create policy tasks_employee_insert_delegated
on public.tasks for insert to authenticated
with check (public.is_employee() and public.tasks_employee_may_assign_to(auth.uid(), assigned_to));

comment on policy tasks_employee_select_assigned on public.tasks is 'Employee sees tasks assigned to them (admin or peer assignee).';
