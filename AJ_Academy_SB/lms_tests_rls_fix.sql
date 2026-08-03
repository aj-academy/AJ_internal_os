-- Fix: infinite recursion in lms_tests / lms_test_recipients RLS policies.
-- Cause: lms_tests student policy reads recipients, and recipients mentor policy
--        reads lms_tests again → Postgres raises "infinite recursion detected".
-- Safe to re-run. Run in Supabase SQL Editor after lms_tests_core.sql.

create or replace function public.lms_test_assigned_by(p_test_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.lms_tests t
    where t.id = p_test_id
      and t.assigned_by = p_user
  );
$$;

create or replace function public.lms_test_student_is_recipient(p_test_id uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.lms_test_recipients r
    where r.test_id = p_test_id
      and r.student_id = p_student
  );
$$;

grant execute on function public.lms_test_assigned_by(uuid, uuid) to authenticated;
grant execute on function public.lms_test_student_is_recipient(uuid, uuid) to authenticated;

-- lms_tests: avoid querying recipients under RLS
drop policy if exists lms_tests_student_select on public.lms_tests;
create policy lms_tests_student_select on public.lms_tests
  for select to authenticated
  using (public.lms_test_student_is_recipient(id, auth.uid()));

-- Child tables: avoid re-entering lms_tests RLS
drop policy if exists lms_test_questions_mentor on public.lms_test_questions;
create policy lms_test_questions_mentor on public.lms_test_questions
  for all to authenticated
  using (public.is_mentor_role() and public.lms_test_assigned_by(test_id, auth.uid()))
  with check (public.is_mentor_role() and public.lms_test_assigned_by(test_id, auth.uid()));

drop policy if exists lms_test_recipients_mentor on public.lms_test_recipients;
create policy lms_test_recipients_mentor on public.lms_test_recipients
  for all to authenticated
  using (public.is_mentor_role() and public.lms_test_assigned_by(test_id, auth.uid()))
  with check (public.is_mentor_role() and public.lms_test_assigned_by(test_id, auth.uid()));

drop policy if exists lms_test_attempts_mentor on public.lms_test_attempts;
create policy lms_test_attempts_mentor on public.lms_test_attempts
  for select to authenticated
  using (public.is_mentor_role() and public.lms_test_assigned_by(test_id, auth.uid()));

drop policy if exists lms_test_answers_mentor on public.lms_test_answers;
create policy lms_test_answers_mentor on public.lms_test_answers
  for select to authenticated
  using (
    public.is_mentor_role()
    and exists (
      select 1
      from public.lms_test_attempts a
      where a.id = attempt_id
        and public.lms_test_assigned_by(a.test_id, auth.uid())
    )
  );
