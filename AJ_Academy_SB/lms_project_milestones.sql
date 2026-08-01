-- =============================================================================
-- LMS Phase 9 — Project milestone submit + mentor evaluate
-- Run after: lms_submissions_proctoring.sql
-- Safe to re-run.
-- =============================================================================

create or replace function public.lms_submit_project_milestone(
  p_project_id uuid,
  p_milestone_id uuid,
  p_text_response text default null,
  p_github_url text default null,
  p_demo_url text default null,
  p_files jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  p public.lms_projects%rowtype;
  m public.lms_project_milestones%rowtype;
  r public.lms_project_recipients%rowtype;
  v_student uuid := auth.uid();
  v_version int;
  v_sub_id uuid;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;

  select * into p from public.lms_projects where id = p_project_id;
  if not found then raise exception 'Project not found'; end if;
  if p.status in ('draft', 'cancelled', 'archived') then
    raise exception 'Project is not open for submissions';
  end if;

  select * into m from public.lms_project_milestones
  where id = p_milestone_id and project_id = p_project_id;
  if not found then raise exception 'Milestone not found'; end if;

  select * into r from public.lms_project_recipients
  where project_id = p_project_id and student_id = v_student
  for update;
  if not found then raise exception 'You are not assigned this project'; end if;

  select coalesce(max(submission_version), 0) + 1 into v_version
  from public.lms_project_submissions
  where project_id = p_project_id
    and student_id = v_student
    and milestone_id = p_milestone_id;

  insert into public.lms_project_submissions (
    project_id, milestone_id, student_id, recipient_id,
    submission_version, text_response, github_url, demo_url, files, status, submitted_at
  ) values (
    p_project_id, p_milestone_id, v_student, r.id,
    v_version,
    p_text_response, p_github_url, p_demo_url,
    coalesce(p_files, '[]'::jsonb),
    'submitted',
    now()
  ) returning id into v_sub_id;

  update public.lms_project_recipients
  set
    status = case
      when r.status in ('assigned', 'topic_pending', 'topic_approved') then 'in_progress'
      when m.milestone_key = 'final' then 'final_submission'
      else 'review_pending'
    end,
    updated_at = now()
  where id = r.id;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_sub_id,
    'submission_version', v_version,
    'milestone_id', p_milestone_id
  );
end;
$$;

grant execute on function public.lms_submit_project_milestone(uuid, uuid, text, text, text, jsonb) to authenticated;

create or replace function public.lms_evaluate_project_submission(
  p_submission_id uuid,
  p_marks numeric,
  p_feedback text default null,
  p_status text default 'evaluated'
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  s public.lms_project_submissions%rowtype;
  p public.lms_projects%rowtype;
  m public.lms_project_milestones%rowtype;
  v_actor uuid := auth.uid();
  v_status text;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;

  select * into s from public.lms_project_submissions where id = p_submission_id;
  if not found then raise exception 'Submission not found'; end if;
  select * into p from public.lms_projects where id = s.project_id;
  select * into m from public.lms_project_milestones where id = s.milestone_id;

  if not public.is_admin() then
    if not public.is_mentor_role() then raise exception 'Forbidden'; end if;
    if p.assigned_by <> v_actor
       and p.guide_mentor_id is distinct from v_actor
       and not public.lms_mentor_has_active_allocation(v_actor, p.department_id, p.course_id, p.batch_id, p.module_id) then
      raise exception 'Not authorized to evaluate this submission';
    end if;
  end if;

  v_status := coalesce(nullif(trim(p_status), ''), 'evaluated');
  if v_status not in ('approved', 'evaluated', 'revision_required') then
    raise exception 'Invalid evaluation status';
  end if;

  if p_marks is not null then
    if p_marks < 0 then raise exception 'Marks cannot be negative'; end if;
    if m.max_marks is not null and m.max_marks > 0 and p_marks > m.max_marks then
      raise exception 'Marks exceed milestone maximum';
    end if;
    if (m.max_marks is null or m.max_marks = 0) and p_marks > p.total_marks then
      raise exception 'Marks exceed project total';
    end if;
  end if;

  update public.lms_project_submissions
  set
    marks = p_marks,
    mentor_feedback = p_feedback,
    status = v_status,
    updated_at = now()
  where id = s.id;

  update public.lms_project_recipients
  set
    status = case
      when v_status = 'revision_required' then 'revision_required'
      when v_status in ('approved', 'evaluated') then 'in_progress'
      else status
    end,
    updated_at = now()
  where id = s.recipient_id;

  return jsonb_build_object('ok', true, 'submission_id', s.id, 'status', v_status);
end;
$$;

grant execute on function public.lms_evaluate_project_submission(uuid, numeric, text, text) to authenticated;
