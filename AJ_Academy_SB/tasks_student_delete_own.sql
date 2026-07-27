-- Allow students to delete tasks assigned to them (My Tasks → Delete selected).
-- Safe to re-run. Run after task_schema.sql / aj_academy_roles_patch.sql.

drop policy if exists tasks_student_delete_own on public.tasks;
drop policy if exists "tasks_student_delete_own" on public.tasks;
create policy tasks_student_delete_own
on public.tasks for delete to authenticated
using (
  lower(btrim(coalesce(public.get_user_role(), ''))) = 'student'
  and assigned_to = auth.uid()
);

comment on policy tasks_student_delete_own on public.tasks is
  'Student can delete tasks assigned to them (My Tasks Delete selected).';
