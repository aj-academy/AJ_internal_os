-- =============================================================================
-- LMS — Storage buckets + assignment submit RPC + proctoring events
-- Run after: lms_tests_core.sql and lms_assignments.sql
-- Safe to re-run.
-- =============================================================================

do $$
begin
  if to_regclass('public.lms_assignments') is null then
    raise exception 'Missing lms_assignments — run lms_assignments.sql first (must succeed fully).';
  end if;
  if to_regclass('public.lms_tests') is null then
    raise exception 'Missing lms_tests — run lms_tests_core.sql first.';
  end if;
end $$;

insert into storage.buckets (id, name, public)
values
  ('assignment-resources', 'assignment-resources', false),
  ('assignment-submissions', 'assignment-submissions', false),
  ('project-submissions', 'project-submissions', false),
  ('test-proctoring', 'test-proctoring', false)
on conflict (id) do update set public = excluded.public;

-- Submit assignment (immutable version)
create or replace function public.lms_submit_assignment(
  p_assignment_id uuid,
  p_text_response text default null,
  p_link_url text default null,
  p_files jsonb default '[]'::jsonb,
  p_declaration boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  a public.lms_assignments%rowtype;
  r public.lms_assignment_recipients%rowtype;
  v_student uuid := auth.uid();
  v_attempt int;
  v_version int;
  v_late boolean := false;
  v_late_mins int := 0;
  v_sub_id uuid;
  v_status text;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;

  select * into a from public.lms_assignments where id = p_assignment_id;
  if not found then raise exception 'Assignment not found'; end if;
  if a.status not in ('published', 'in_progress', 'due', 'scheduled') then
    raise exception 'Assignment is not open for submission';
  end if;

  select * into r from public.lms_assignment_recipients
  where assignment_id = p_assignment_id and student_id = v_student
  for update;
  if not found then raise exception 'You are not assigned this assignment'; end if;

  if a.due_at is not null and now() > a.due_at then
    if not a.allow_late then
      if a.late_deadline_at is null or now() > a.late_deadline_at then
        raise exception 'Late submissions are not allowed';
      end if;
    end if;
    v_late := true;
    v_late_mins := greatest(0, floor(extract(epoch from (now() - a.due_at)) / 60)::int);
  end if;

  select coalesce(max(attempt_number), 0) into v_attempt
  from public.lms_assignment_submissions
  where assignment_id = p_assignment_id and student_id = v_student;

  if v_attempt >= a.max_attempts and r.status not in ('resubmission_requested') then
    raise exception 'Maximum attempts reached';
  end if;

  if r.status = 'resubmission_requested' then
    v_attempt := v_attempt; -- keep same attempt bucket, bump version
  else
    v_attempt := v_attempt + 1;
  end if;

  select coalesce(max(submission_version), 0) + 1 into v_version
  from public.lms_assignment_submissions
  where assignment_id = p_assignment_id and student_id = v_student and attempt_number = greatest(v_attempt, 1);

  if v_attempt < 1 then v_attempt := 1; end if;

  insert into public.lms_assignment_submissions (
    assignment_id, recipient_id, student_id, attempt_number, submission_version,
    text_response, link_url, files, is_late, late_duration_minutes, student_declaration
  ) values (
    p_assignment_id, r.id, v_student, v_attempt, v_version,
    p_text_response, p_link_url, coalesce(p_files, '[]'::jsonb), v_late, v_late_mins, coalesce(p_declaration, false)
  ) returning id into v_sub_id;

  v_status := case when v_late then 'submitted_late' else 'submitted' end;
  if r.status = 'resubmission_requested' then v_status := 'resubmitted'; end if;

  update public.lms_assignment_recipients
  set status = v_status, updated_at = now()
  where id = r.id;

  return jsonb_build_object(
    'ok', true,
    'submission_id', v_sub_id,
    'attempt_number', v_attempt,
    'submission_version', v_version,
    'is_late', v_late,
    'status', v_status
  );
end;
$$;

grant execute on function public.lms_submit_assignment(uuid, text, text, jsonb, boolean) to authenticated;

-- Mentor evaluation
create or replace function public.lms_evaluate_assignment_submission(
  p_submission_id uuid,
  p_awarded_marks numeric,
  p_feedback_text text default null,
  p_request_resubmission boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  s public.lms_assignment_submissions%rowtype;
  a public.lms_assignments%rowtype;
  v_actor uuid := auth.uid();
  v_eval_id uuid;
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  select * into s from public.lms_assignment_submissions where id = p_submission_id;
  if not found then raise exception 'Submission not found'; end if;
  select * into a from public.lms_assignments where id = s.assignment_id;

  if not public.is_admin() then
    if not public.is_mentor_role() then raise exception 'Forbidden'; end if;
    if a.assigned_by <> v_actor
       and not public.lms_mentor_has_active_allocation(v_actor, a.department_id, a.course_id, a.batch_id, a.module_id) then
      raise exception 'Not authorized to evaluate this submission';
    end if;
  end if;

  if p_awarded_marks < 0 or p_awarded_marks > a.total_marks then
    raise exception 'Marks out of range';
  end if;

  insert into public.lms_assignment_evaluations (
    submission_id, assignment_id, student_id, evaluator_id,
    awarded_marks, max_marks, feedback_text, request_resubmission
  ) values (
    s.id, s.assignment_id, s.student_id, v_actor,
    p_awarded_marks, a.total_marks, p_feedback_text, coalesce(p_request_resubmission, false)
  ) returning id into v_eval_id;

  update public.lms_assignment_submissions
  set evaluation_status = case when p_request_resubmission then 'returned' else 'evaluated' end,
      updated_at = now()
  where id = s.id;

  update public.lms_assignment_recipients
  set status = case when p_request_resubmission then 'resubmission_requested' else 'evaluated' end,
      updated_at = now()
  where id = s.recipient_id;

  return jsonb_build_object('ok', true, 'evaluation_id', v_eval_id);
end;
$$;

grant execute on function public.lms_evaluate_assignment_submission(uuid, numeric, text, boolean) to authenticated;

-- Mark assignment viewed
create or replace function public.lms_mark_assignment_viewed(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  update public.lms_assignment_recipients
  set
    first_viewed_at = coalesce(first_viewed_at, now()),
    last_viewed_at = now(),
    status = case when status = 'assigned' then 'viewed' else status end,
    updated_at = now()
  where assignment_id = p_assignment_id and student_id = auth.uid();
end;
$$;

grant execute on function public.lms_mark_assignment_viewed(uuid) to authenticated;

-- Proctoring policy + consent + events
create table if not exists public.lms_proctoring_policies (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  title text not null,
  body text not null,
  retention_days integer not null default 90,
  captures_snapshots boolean not null default true,
  captures_video boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.lms_proctoring_policies (version, title, body, active)
values (
  'v1',
  'AJ Academy Secure Test Proctoring Notice',
  'Camera access may be required for this test. Snapshots may be captured at start, on violations, and at intervals. Media is stored privately, visible only to authorized mentors/admins, retained per policy, then deleted. Tab/app switches may be logged and can auto-submit the test per the configured policy. By continuing you consent to these terms.',
  true
)
on conflict (version) do nothing;

create table if not exists public.lms_test_proctoring_consents (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.lms_tests (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  policy_version text not null,
  consented_at timestamptz not null default now(),
  client_meta jsonb not null default '{}'::jsonb,
  constraint lms_test_proctoring_consents_unique unique (test_id, student_id, policy_version)
);

create table if not exists public.lms_test_proctoring_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.lms_test_attempts (id) on delete cascade,
  test_id uuid not null references public.lms_tests (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null
    check (event_type in (
      'visibility_hidden', 'window_blur', 'fullscreen_exit', 'camera_denied',
      'camera_stopped', 'network_offline', 'heartbeat_miss', 'copy', 'paste',
      'right_click', 'reload', 'duplicate_window', 'identity_snapshot',
      'periodic_snapshot', 'violation_snapshot', 'consent_accepted', 'other'
    )),
  severity text not null default 'info' check (severity in ('info', 'warn', 'critical')),
  browser_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lms_test_proctoring_events_attempt_idx
  on public.lms_test_proctoring_events (attempt_id, created_at desc);

create table if not exists public.lms_test_proctoring_media (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.lms_test_attempts (id) on delete cascade,
  test_id uuid not null references public.lms_tests (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  event_id uuid references public.lms_test_proctoring_events (id) on delete set null,
  capture_reason text not null,
  storage_path text not null,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'clear', 'flagged', 'dismissed')),
  reviewer_id uuid references public.profiles (id) on delete set null,
  reviewer_remarks text,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.lms_log_proctoring_event(
  p_attempt_id uuid,
  p_event_type text,
  p_severity text default 'warn',
  p_browser_state jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  a public.lms_test_attempts%rowtype;
  v_id uuid;
  v_student uuid := auth.uid();
begin
  if v_student is null then raise exception 'Not authenticated'; end if;
  select * into a from public.lms_test_attempts where id = p_attempt_id;
  if not found or a.student_id <> v_student then raise exception 'Attempt not found'; end if;

  insert into public.lms_test_proctoring_events (
    attempt_id, test_id, student_id, event_type, severity, browser_state
  ) values (
    a.id, a.test_id, v_student, p_event_type, coalesce(p_severity, 'warn'), coalesce(p_browser_state, '{}'::jsonb)
  ) returning id into v_id;

  update public.lms_test_attempts set last_heartbeat_at = now(), updated_at = now() where id = a.id;
  return v_id;
end;
$$;

grant execute on function public.lms_log_proctoring_event(uuid, text, text, jsonb) to authenticated;

create or replace function public.lms_record_proctoring_consent(
  p_test_id uuid,
  p_policy_version text,
  p_client_meta jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
  v_student uuid := auth.uid();
begin
  if v_student is null then raise exception 'Not authenticated'; end if;
  insert into public.lms_test_proctoring_consents (test_id, student_id, policy_version, client_meta)
  values (p_test_id, v_student, p_policy_version, coalesce(p_client_meta, '{}'::jsonb))
  on conflict (test_id, student_id, policy_version) do update
  set consented_at = now(), client_meta = excluded.client_meta
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.lms_record_proctoring_consent(uuid, text, jsonb) to authenticated;

-- RLS
alter table public.lms_proctoring_policies enable row level security;
alter table public.lms_test_proctoring_consents enable row level security;
alter table public.lms_test_proctoring_events enable row level security;
alter table public.lms_test_proctoring_media enable row level security;

grant select on public.lms_proctoring_policies to authenticated;
grant select, insert on public.lms_test_proctoring_consents to authenticated;
grant select, insert on public.lms_test_proctoring_events to authenticated;
grant select, insert, update on public.lms_test_proctoring_media to authenticated;

drop policy if exists lms_proctoring_policies_read on public.lms_proctoring_policies;
create policy lms_proctoring_policies_read on public.lms_proctoring_policies
  for select to authenticated using (active = true or public.is_admin());

drop policy if exists lms_proctoring_consents_self on public.lms_test_proctoring_consents;
create policy lms_proctoring_consents_self on public.lms_test_proctoring_consents
  for all to authenticated using (student_id = auth.uid() or public.is_admin())
  with check (student_id = auth.uid());

drop policy if exists lms_proctoring_events_admin on public.lms_test_proctoring_events;
create policy lms_proctoring_events_admin on public.lms_test_proctoring_events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_proctoring_events_student_insert on public.lms_test_proctoring_events;
create policy lms_proctoring_events_student_insert on public.lms_test_proctoring_events
  for insert to authenticated with check (student_id = auth.uid());

drop policy if exists lms_proctoring_events_student_select on public.lms_test_proctoring_events;
create policy lms_proctoring_events_student_select on public.lms_test_proctoring_events
  for select to authenticated using (student_id = auth.uid());

drop policy if exists lms_proctoring_events_mentor on public.lms_test_proctoring_events;
create policy lms_proctoring_events_mentor on public.lms_test_proctoring_events
  for select to authenticated
  using (
    public.is_mentor_role()
    and exists (select 1 from public.lms_tests t where t.id = test_id and t.assigned_by = auth.uid())
  );

drop policy if exists lms_proctoring_media_admin on public.lms_test_proctoring_media;
create policy lms_proctoring_media_admin on public.lms_test_proctoring_media
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_proctoring_media_mentor on public.lms_test_proctoring_media;
create policy lms_proctoring_media_mentor on public.lms_test_proctoring_media
  for select to authenticated
  using (
    public.is_mentor_role()
    and exists (select 1 from public.lms_tests t where t.id = test_id and t.assigned_by = auth.uid())
  );

comment on table public.lms_test_proctoring_events is 'Strict-mode proctoring events; server remains source of truth.';
