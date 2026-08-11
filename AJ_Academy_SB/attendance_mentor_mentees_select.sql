-- Mentor SELECT on attendance_records for ACTIVE mentee allocations only.
-- Does NOT reuse sma_mentor_can_access_student (that helper also allows
-- readonly historical assignments, assigned_mentor_id, and LMS scope).
--
-- BEFORE APPLY — Existing policies on public.attendance_records:
--   attendance_employee_own  FOR ALL    USING (employee_id = auth.uid()) WITH CHECK (same)
--   attendance_admin_read_all FOR SELECT USING (public.is_admin())
--   attendance_admin_delete_all FOR DELETE USING (public.is_admin())
--
-- Effect after apply:
--   Student: unchanged (own rows only for read/write)
--   Mentor:  SELECT mentee attendance when student_mentor_assignments.status = 'active'
--            NO write on mentee rows; NO department-only access; NO expired/inactive
--   Admin:   unchanged (is_admin() SELECT/DELETE)
--
-- Rollback:
--   drop policy if exists attendance_mentor_active_mentees_select on public.attendance_records;
--   drop function if exists public.sma_mentor_can_read_student_attendance(uuid, uuid);

create or replace function public.sma_mentor_can_read_student_attendance(
  p_mentor uuid,
  p_student uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.student_mentor_assignments a
    where a.mentor_id = p_mentor
      and a.student_id = p_student
      and a.status = 'active'
  );
$$;

comment on function public.sma_mentor_can_read_student_attendance(uuid, uuid) is
  'True only when mentor has an active student_mentor_assignments row for the student.';

grant execute on function public.sma_mentor_can_read_student_attendance(uuid, uuid) to authenticated;

drop policy if exists attendance_mentor_active_mentees_select on public.attendance_records;
create policy attendance_mentor_active_mentees_select
on public.attendance_records
for select
to authenticated
using (
  public.sma_mentor_can_read_student_attendance(auth.uid(), employee_id)
);

-- Intentionally no USING (true). Intentionally no mentor INSERT/UPDATE on mentee rows.
