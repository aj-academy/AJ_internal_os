-- Fix: infinite recursion in LMS parent ↔ recipient RLS (mentor sessions).
-- Cause: student policies on parents SELECT recipients; mentor policies on
--        recipients SELECT parents again. Mentors evaluate BOTH → recursion.
-- Safe to re-run. Run once in Supabase SQL Editor if mentor LMS pages error with
--   "infinite recursion detected in policy for relation …"
-- Covers: assignments, projects, study materials (+ re-applies tests helpers).

-- =============================================================================
-- Shared-style helpers (SECURITY DEFINER, row_security off)
-- =============================================================================

create or replace function public.lms_assignment_student_is_recipient(p_assignment_id uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.lms_assignment_recipients r
    where r.assignment_id = p_assignment_id
      and r.student_id = p_student
  );
$$;

create or replace function public.lms_assignment_mentor_can_access(p_assignment_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.lms_assignments a
    where a.id = p_assignment_id
      and (
        a.assigned_by = p_user
        or public.lms_mentor_has_active_allocation(
          p_user, a.department_id, a.course_id, a.batch_id, a.module_id
        )
      )
  );
$$;

create or replace function public.lms_project_student_is_recipient(p_project_id uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.lms_project_recipients r
    where r.project_id = p_project_id
      and r.student_id = p_student
  );
$$;

create or replace function public.lms_project_mentor_can_access(p_project_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.lms_projects p
    where p.id = p_project_id
      and (
        p.assigned_by = p_user
        or public.lms_mentor_has_active_allocation(
          p_user, p.department_id, p.course_id, p.batch_id, p.module_id
        )
      )
  );
$$;

create or replace function public.lms_material_student_is_recipient(p_material_id uuid, p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.lms_study_material_recipients r
    where r.material_id = p_material_id
      and r.student_id = p_student
  );
$$;

create or replace function public.lms_material_mentor_can_access(p_material_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.lms_study_materials m
    where m.id = p_material_id
      and (
        m.assigned_by = p_user
        or public.lms_mentor_has_active_allocation(
          p_user, m.department_id, m.course_id, m.batch_id, m.module_id
        )
      )
  );
$$;

-- Tests helpers (idempotent if lms_tests_rls_fix already ran)
create or replace function public.lms_test_assigned_by(p_test_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.lms_tests t
    where t.id = p_test_id and t.assigned_by = p_user
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
    select 1 from public.lms_test_recipients r
    where r.test_id = p_test_id and r.student_id = p_student
  );
$$;

grant execute on function public.lms_assignment_student_is_recipient(uuid, uuid) to authenticated;
grant execute on function public.lms_assignment_mentor_can_access(uuid, uuid) to authenticated;
grant execute on function public.lms_project_student_is_recipient(uuid, uuid) to authenticated;
grant execute on function public.lms_project_mentor_can_access(uuid, uuid) to authenticated;
grant execute on function public.lms_material_student_is_recipient(uuid, uuid) to authenticated;
grant execute on function public.lms_material_mentor_can_access(uuid, uuid) to authenticated;
grant execute on function public.lms_test_assigned_by(uuid, uuid) to authenticated;
grant execute on function public.lms_test_student_is_recipient(uuid, uuid) to authenticated;

-- =============================================================================
-- Assignments
-- =============================================================================

drop policy if exists lms_assignments_student_select on public.lms_assignments;
create policy lms_assignments_student_select on public.lms_assignments
  for select to authenticated
  using (
    status in ('published', 'in_progress', 'due', 'closed', 'scheduled')
    and public.lms_assignment_student_is_recipient(id, auth.uid())
  );

drop policy if exists lms_assignment_recipients_mentor_select on public.lms_assignment_recipients;
create policy lms_assignment_recipients_mentor_select on public.lms_assignment_recipients
  for select to authenticated
  using (
    public.is_mentor_role()
    and public.lms_assignment_mentor_can_access(assignment_id, auth.uid())
  );

drop policy if exists lms_assignment_submissions_mentor_select on public.lms_assignment_submissions;
create policy lms_assignment_submissions_mentor_select on public.lms_assignment_submissions
  for select to authenticated
  using (
    public.is_mentor_role()
    and public.lms_assignment_mentor_can_access(assignment_id, auth.uid())
  );

drop policy if exists lms_assignment_evaluations_mentor_rw on public.lms_assignment_evaluations;
create policy lms_assignment_evaluations_mentor_rw on public.lms_assignment_evaluations
  for all to authenticated
  using (
    public.is_mentor_role()
    and (
      evaluator_id = auth.uid()
      or public.lms_assignment_mentor_can_access(assignment_id, auth.uid())
    )
  )
  with check (public.is_mentor_role());

-- =============================================================================
-- Projects
-- =============================================================================

drop policy if exists lms_projects_student_select on public.lms_projects;
create policy lms_projects_student_select on public.lms_projects
  for select to authenticated
  using (public.lms_project_student_is_recipient(id, auth.uid()));

drop policy if exists lms_project_recipients_mentor_select on public.lms_project_recipients;
create policy lms_project_recipients_mentor_select on public.lms_project_recipients
  for select to authenticated
  using (
    public.is_mentor_role()
    and public.lms_project_mentor_can_access(project_id, auth.uid())
  );

drop policy if exists lms_project_members_participant on public.lms_project_members;
create policy lms_project_members_participant on public.lms_project_members
  for select to authenticated
  using (
    student_id = auth.uid()
    or public.is_admin()
    or (
      public.is_mentor_role()
      and public.lms_project_mentor_can_access(project_id, auth.uid())
    )
  );

drop policy if exists lms_project_milestones_rw on public.lms_project_milestones;
create policy lms_project_milestones_rw on public.lms_project_milestones
  for all to authenticated
  using (
    public.is_admin()
    or (
      public.is_mentor_role()
      and public.lms_project_mentor_can_access(project_id, auth.uid())
    )
    or public.lms_project_student_is_recipient(project_id, auth.uid())
  )
  with check (
    public.is_admin()
    or (
      public.is_mentor_role()
      and public.lms_project_mentor_can_access(project_id, auth.uid())
    )
  );

drop policy if exists lms_project_submissions_mentor_select on public.lms_project_submissions;
create policy lms_project_submissions_mentor_select on public.lms_project_submissions
  for select to authenticated
  using (
    public.is_mentor_role()
    and public.lms_project_mentor_can_access(project_id, auth.uid())
  );

-- =============================================================================
-- Study materials
-- =============================================================================

drop policy if exists lms_study_materials_student_select on public.lms_study_materials;
create policy lms_study_materials_student_select on public.lms_study_materials
  for select to authenticated
  using (
    status in ('published', 'scheduled')
    and public.lms_material_student_is_recipient(id, auth.uid())
  );

drop policy if exists lms_study_material_recipients_mentor on public.lms_study_material_recipients;
create policy lms_study_material_recipients_mentor on public.lms_study_material_recipients
  for select to authenticated
  using (
    public.is_mentor_role()
    and public.lms_material_mentor_can_access(material_id, auth.uid())
  );

-- =============================================================================
-- Tests (same fix as lms_tests_rls_fix.sql)
-- =============================================================================

drop policy if exists lms_tests_student_select on public.lms_tests;
create policy lms_tests_student_select on public.lms_tests
  for select to authenticated
  using (public.lms_test_student_is_recipient(id, auth.uid()));

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
      select 1 from public.lms_test_attempts a
      where a.id = attempt_id
        and public.lms_test_assigned_by(a.test_id, auth.uid())
    )
  );

-- Proctoring (if tables exist from lms_submissions_proctoring.sql)
do $$
begin
  if to_regclass('public.lms_test_proctoring_events') is not null then
    execute 'drop policy if exists lms_proctoring_events_mentor on public.lms_test_proctoring_events';
    execute $p$
      create policy lms_proctoring_events_mentor on public.lms_test_proctoring_events
        for select to authenticated
        using (
          public.is_mentor_role()
          and public.lms_test_assigned_by(test_id, auth.uid())
        )
    $p$;
  end if;
  if to_regclass('public.lms_test_proctoring_media') is not null then
    execute 'drop policy if exists lms_proctoring_media_mentor on public.lms_test_proctoring_media';
    execute $p$
      create policy lms_proctoring_media_mentor on public.lms_test_proctoring_media
        for select to authenticated
        using (
          public.is_mentor_role()
          and public.lms_test_assigned_by(test_id, auth.uid())
        )
    $p$;
  end if;
end $$;
