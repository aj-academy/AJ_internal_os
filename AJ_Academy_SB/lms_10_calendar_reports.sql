-- =============================================================================
-- LMS Phase 10 — Academic calendar + lightweight report helpers
-- Run after: lms_09_project_milestones.sql
-- Safe to re-run.
-- =============================================================================

create table if not exists public.lms_academic_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type text not null default 'general'
    check (event_type in (
      'general', 'assignment_due', 'project_milestone', 'test', 'holiday',
      'exam', 'presentation', 'viva', 'orientation', 'other'
    )),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  department_id uuid references public.academic_departments (id) on delete set null,
  course_id uuid references public.academic_courses (id) on delete set null,
  batch_id uuid references public.academic_batches (id) on delete set null,
  related_assignment_id uuid references public.lms_assignments (id) on delete set null,
  related_project_id uuid references public.lms_projects (id) on delete set null,
  related_test_id uuid references public.lms_tests (id) on delete set null,
  visibility text not null default 'scoped'
    check (visibility in ('all', 'scoped', 'staff_only')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lms_academic_events_starts_idx
  on public.lms_academic_events (starts_at);

create index if not exists lms_academic_events_scope_idx
  on public.lms_academic_events (department_id, course_id, batch_id);

drop trigger if exists lms_academic_events_touch on public.lms_academic_events;
create trigger lms_academic_events_touch
  before update on public.lms_academic_events
  for each row execute function public.lms_touch_updated_at();

alter table public.lms_academic_events enable row level security;
grant select, insert, update, delete on public.lms_academic_events to authenticated;

drop policy if exists lms_academic_events_admin_all on public.lms_academic_events;
create policy lms_academic_events_admin_all on public.lms_academic_events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_academic_events_mentor_rw on public.lms_academic_events;
create policy lms_academic_events_mentor_rw on public.lms_academic_events
  for all to authenticated
  using (
    public.is_mentor_role()
    and (
      department_id is null
      or public.lms_mentor_has_active_allocation(auth.uid(), department_id, course_id, batch_id, null)
    )
  )
  with check (
    public.is_mentor_role()
    and (
      department_id is null
      or public.lms_mentor_has_active_allocation(auth.uid(), department_id, course_id, batch_id, null)
    )
  );

drop policy if exists lms_academic_events_student_select on public.lms_academic_events;
create policy lms_academic_events_student_select on public.lms_academic_events
  for select to authenticated
  using (
    visibility <> 'staff_only'
    and (
      visibility = 'all'
      or department_id is null
      or exists (
        select 1 from public.student_enrolments e
        where e.student_id = auth.uid()
          and e.status = 'active'
          and e.department_id = lms_academic_events.department_id
          and (lms_academic_events.course_id is null or e.course_id = lms_academic_events.course_id)
          and (lms_academic_events.batch_id is null or e.batch_id is null or e.batch_id = lms_academic_events.batch_id)
      )
    )
  );

-- Aggregate counts for dashboards (staff)
create or replace function public.lms_report_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  if not (public.is_admin() or public.is_mentor_role()) then
    raise exception 'Forbidden';
  end if;

  return jsonb_build_object(
    'assignments_published', (select count(*)::int from public.lms_assignments where status in ('published', 'in_progress', 'due', 'scheduled')),
    'assignment_submissions_pending', (
      select count(*)::int from public.lms_assignment_submissions s
      where s.evaluation_status in ('pending', 'in_review')
    ),
    'projects_active', (select count(*)::int from public.lms_projects where status not in ('draft', 'cancelled', 'archived', 'completed', 'evaluated')),
    'project_submissions_pending', (
      select count(*)::int from public.lms_project_submissions where status = 'submitted'
    ),
    'tests_published', (select count(*)::int from public.lms_tests where status in ('published', 'scheduled', 'in_progress')),
    'open_tickets', (
      select count(*)::int from public.lms_student_tickets
      where status in ('open', 'assigned', 'in_review', 'waiting_for_student', 'escalated', 'reopened')
        and coalesce(is_sensitive, false) = false
    ),
    'active_enrolments', (select count(*)::int from public.student_enrolments where status = 'active'),
    'active_allocations', (
      select count(*)::int from public.mentor_allocations
      where public.lms_allocation_is_effective(status, start_date, end_date)
    ),
    'upcoming_events_7d', (
      select count(*)::int from public.lms_academic_events
      where starts_at >= now() and starts_at < now() + interval '7 days'
    )
  );
end;
$$;

grant execute on function public.lms_report_summary() to authenticated;
