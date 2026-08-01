-- =============================================================================
-- LMS Phase 5–6 — Test management core (no full proctoring yet)
-- Run after: lms_mentor_allocations.sql (and ideally lms_assignments.sql+)
-- Safe to re-run.
-- =============================================================================

create table if not exists public.lms_question_bank (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  question_type text not null
    check (question_type in (
      'single_mcq', 'multi_mcq', 'true_false', 'fill_blank', 'short_answer',
      'long_answer', 'numerical', 'match', 'ordering', 'file_upload', 'code'
    )),
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb,
  explanation text,
  marks numeric(10,2) not null default 1,
  negative_marks numeric(10,2) not null default 0,
  difficulty text,
  topic text,
  department_id uuid references public.academic_departments (id) on delete set null,
  module_id uuid references public.academic_modules (id) on delete set null,
  tags text[] not null default '{}'::text[],
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lms_question_bank_created_by_idx on public.lms_question_bank (created_by);

drop trigger if exists lms_question_bank_touch on public.lms_question_bank;
create trigger lms_question_bank_touch
  before update on public.lms_question_bank
  for each row execute function public.lms_touch_updated_at();

create table if not exists public.lms_tests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  instructions text,
  declaration_text text,
  test_type text not null default 'practice'
    check (test_type in (
      'practice', 'internal', 'mock', 'placement', 'technical', 'aptitude', 'certification', 'final'
    )),
  department_id uuid not null references public.academic_departments (id) on delete restrict,
  course_id uuid references public.academic_courses (id) on delete set null,
  batch_id uuid references public.academic_batches (id) on delete set null,
  module_id uuid references public.academic_modules (id) on delete set null,
  start_at timestamptz,
  end_at timestamptz,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  grace_period_seconds integer not null default 30,
  max_attempts integer not null default 1 check (max_attempts >= 1),
  passing_marks numeric(10,2) not null default 40,
  total_marks numeric(10,2) not null default 100,
  negative_marking boolean not null default false,
  randomize_questions boolean not null default false,
  randomize_options boolean not null default false,
  questions_per_student integer,
  one_question_per_page boolean not null default false,
  allow_navigation boolean not null default true,
  allow_answer_review boolean not null default true,
  autosave_interval_seconds integer not null default 15,
  result_visibility text not null default 'after_evaluation'
    check (result_visibility in ('immediate', 'after_evaluation', 'manual_release', 'hidden')),
  show_correct_answers boolean not null default false,
  show_explanations boolean not null default false,
  camera_required boolean not null default false,
  microphone_required boolean not null default false,
  fullscreen_required boolean not null default false,
  tab_switch_policy text not null default 'warn'
    check (tab_switch_policy in ('log_only', 'warn', 'auto_submit_after_count', 'immediate_auto_submit')),
  tab_switch_limit integer not null default 1,
  security_mode text not null default 'normal'
    check (security_mode in ('normal', 'strict_browser', 'safe_exam_browser')),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'in_progress', 'closed', 'archived', 'cancelled')),
  audience_type text not null default 'selected_students'
    check (audience_type in (
      'individual', 'selected_students', 'batch', 'department', 'course', 'custom_group'
    )),
  assigned_by uuid not null references public.profiles (id) on delete restrict,
  published_at timestamptz,
  publish_idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint lms_tests_publish_key_unique unique (publish_idempotency_key)
);

create index if not exists lms_tests_dept_idx on public.lms_tests (department_id);
create index if not exists lms_tests_status_idx on public.lms_tests (status);

drop trigger if exists lms_tests_touch on public.lms_tests;
create trigger lms_tests_touch
  before update on public.lms_tests
  for each row execute function public.lms_touch_updated_at();

create table if not exists public.lms_test_questions (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.lms_tests (id) on delete cascade,
  question_bank_id uuid references public.lms_question_bank (id) on delete set null,
  question text not null,
  question_type text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer jsonb,
  explanation text,
  marks numeric(10,2) not null default 1,
  negative_marks numeric(10,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists lms_test_questions_test_idx on public.lms_test_questions (test_id, sort_order);

create table if not exists public.lms_test_recipients (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.lms_tests (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  enrolment_id uuid references public.student_enrolments (id) on delete set null,
  status text not null default 'assigned'
    check (status in ('assigned', 'started', 'submitted', 'evaluated', 'missed', 'absent')),
  attempts_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lms_test_recipients_unique unique (test_id, student_id)
);

create index if not exists lms_test_recipients_student_idx on public.lms_test_recipients (student_id);

drop trigger if exists lms_test_recipients_touch on public.lms_test_recipients;
create trigger lms_test_recipients_touch
  before update on public.lms_test_recipients
  for each row execute function public.lms_touch_updated_at();

create table if not exists public.lms_test_attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.lms_tests (id) on delete cascade,
  recipient_id uuid not null references public.lms_test_recipients (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  attempt_number integer not null check (attempt_number >= 1),
  status text not null default 'in_progress'
    check (status in (
      'in_progress', 'submitted', 'auto_submitted_time', 'auto_submitted_tab_switch',
      'auto_submitted_camera', 'abandoned', 'evaluated'
    )),
  server_started_at timestamptz not null default now(),
  server_deadline_at timestamptz not null,
  submitted_at timestamptz,
  submission_reason text,
  score numeric(10,2),
  max_score numeric(10,2),
  result_status text not null default 'pending'
    check (result_status in (
      'pending', 'evaluated', 'withheld', 'published', 're_evaluation', 'finalized'
    )),
  last_heartbeat_at timestamptz,
  client_meta jsonb not null default '{}'::jsonb,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lms_test_attempts_unique unique (test_id, student_id, attempt_number)
);

create index if not exists lms_test_attempts_student_idx on public.lms_test_attempts (student_id, status);

drop trigger if exists lms_test_attempts_touch on public.lms_test_attempts;
create trigger lms_test_attempts_touch
  before update on public.lms_test_attempts
  for each row execute function public.lms_touch_updated_at();

create table if not exists public.lms_test_attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.lms_test_attempts (id) on delete cascade,
  test_question_id uuid not null references public.lms_test_questions (id) on delete cascade,
  sort_order integer not null default 0,
  options_snapshot jsonb not null default '[]'::jsonb,
  constraint lms_test_attempt_questions_unique unique (attempt_id, test_question_id)
);

create table if not exists public.lms_test_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.lms_test_attempts (id) on delete cascade,
  test_question_id uuid not null references public.lms_test_questions (id) on delete cascade,
  selected_answer jsonb,
  text_answer text,
  code_answer text,
  file_answer jsonb,
  save_version integer not null default 1,
  is_final boolean not null default false,
  is_correct boolean,
  awarded_marks numeric(10,2),
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lms_test_answers_unique unique (attempt_id, test_question_id)
);

create index if not exists lms_test_answers_attempt_idx on public.lms_test_answers (attempt_id);

drop trigger if exists lms_test_answers_touch on public.lms_test_answers;
create trigger lms_test_answers_touch
  before update on public.lms_test_answers
  for each row execute function public.lms_touch_updated_at();

-- Publish test recipients
create or replace function public.lms_publish_test(
  p_test_id uuid,
  p_student_ids uuid[] default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  t public.lms_tests%rowtype;
  v_ids uuid[];
  v_sid uuid;
  v_count int := 0;
  v_qcount int := 0;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  select * into t from public.lms_tests where id = p_test_id for update;
  if not found then raise exception 'Test not found'; end if;

  select count(*) into v_qcount from public.lms_test_questions where test_id = t.id;
  if v_qcount = 0 then raise exception 'Add at least one question before publishing'; end if;

  if t.status = 'published' and t.publish_idempotency_key is not null
     and p_idempotency_key is not null
     and t.publish_idempotency_key = p_idempotency_key then
    return jsonb_build_object('ok', true, 'idempotent', true, 'test_id', t.id);
  end if;

  if not public.is_admin() then
    if not public.lms_mentor_has_active_allocation(v_actor, t.department_id, t.course_id, t.batch_id, t.module_id) then
      raise exception 'No active mentor allocation for this scope';
    end if;
    if t.assigned_by <> v_actor then raise exception 'Only the assigner or admin can publish'; end if;
  end if;

  if p_student_ids is not null and array_length(p_student_ids, 1) > 0 then
    v_ids := p_student_ids;
  else
    select coalesce(array_agg(s.student_id), array[]::uuid[]) into v_ids
    from public.lms_eligible_students_for_scope(t.department_id, t.course_id, t.batch_id) s;
  end if;

  if v_ids is null or coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'No eligible students for this audience';
  end if;

  foreach v_sid in array v_ids loop
    insert into public.lms_test_recipients (test_id, student_id, enrolment_id)
    values (
      t.id, v_sid,
      (select e.id from public.student_enrolments e
       where e.student_id = v_sid and e.status = 'active' and e.department_id = t.department_id
         and (t.course_id is null or e.course_id = t.course_id)
         and (t.batch_id is null or e.batch_id is null or e.batch_id = t.batch_id)
       order by e.enrolled_at desc limit 1)
    )
    on conflict (test_id, student_id) do nothing;
  end loop;

  select count(*)::int into v_count from public.lms_test_recipients where test_id = t.id;

  update public.lms_tests
  set status = case when start_at is not null and start_at > now() then 'scheduled' else 'published' end,
      published_at = coalesce(published_at, now()),
      publish_idempotency_key = coalesce(p_idempotency_key, publish_idempotency_key, gen_random_uuid()::text),
      updated_by = v_actor,
      updated_at = now()
  where id = t.id;

  return jsonb_build_object('ok', true, 'test_id', t.id, 'recipient_count', v_count, 'question_count', v_qcount);
end;
$$;

grant execute on function public.lms_publish_test(uuid, uuid[], text) to authenticated;

-- Start attempt (server timer)
create or replace function public.lms_start_test_attempt(p_test_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  t public.lms_tests%rowtype;
  r public.lms_test_recipients%rowtype;
  v_student uuid := auth.uid();
  v_attempt public.lms_test_attempts%rowtype;
  v_deadline timestamptz;
  v_attempt_no int;
  q record;
  v_order int := 0;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;
  select * into t from public.lms_tests where id = p_test_id;
  if not found then raise exception 'Test not found'; end if;
  if t.status not in ('published', 'scheduled', 'in_progress') then
    raise exception 'Test is not available';
  end if;
  if t.start_at is not null and t.start_at > now() then raise exception 'Test has not started yet'; end if;
  if t.end_at is not null and t.end_at < now() then raise exception 'Test window has ended'; end if;

  select * into r from public.lms_test_recipients
  where test_id = p_test_id and student_id = v_student;
  if not found then raise exception 'You are not assigned this test'; end if;

  select * into v_attempt from public.lms_test_attempts
  where test_id = p_test_id and student_id = v_student and status = 'in_progress' and locked = false
  order by attempt_number desc limit 1;

  if found then
    return jsonb_build_object('ok', true, 'attempt_id', v_attempt.id, 'resumed', true,
      'server_started_at', v_attempt.server_started_at, 'server_deadline_at', v_attempt.server_deadline_at);
  end if;

  if r.attempts_used >= t.max_attempts then raise exception 'No attempts remaining'; end if;

  v_attempt_no := r.attempts_used + 1;
  v_deadline := now() + make_interval(mins => t.duration_minutes) + make_interval(secs => t.grace_period_seconds);

  insert into public.lms_test_attempts (
    test_id, recipient_id, student_id, attempt_number, server_deadline_at, max_score, last_heartbeat_at
  ) values (
    t.id, r.id, v_student, v_attempt_no, v_deadline, t.total_marks, now()
  ) returning * into v_attempt;

  update public.lms_test_recipients
  set attempts_used = v_attempt_no, status = 'started', updated_at = now()
  where id = r.id;

  for q in
    select * from public.lms_test_questions where test_id = t.id
    order by case when t.randomize_questions then random() else sort_order end
    limit coalesce(t.questions_per_student, 100000)
  loop
    v_order := v_order + 1;
    insert into public.lms_test_attempt_questions (attempt_id, test_question_id, sort_order, options_snapshot)
    values (v_attempt.id, q.id, v_order, q.options);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'attempt_id', v_attempt.id,
    'resumed', false,
    'server_started_at', v_attempt.server_started_at,
    'server_deadline_at', v_attempt.server_deadline_at
  );
end;
$$;

grant execute on function public.lms_start_test_attempt(uuid) to authenticated;

-- Autosave answer
create or replace function public.lms_save_test_answer(
  p_attempt_id uuid,
  p_test_question_id uuid,
  p_selected_answer jsonb default null,
  p_text_answer text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  a public.lms_test_attempts%rowtype;
  v_student uuid := auth.uid();
  v_version int;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;
  select * into a from public.lms_test_attempts where id = p_attempt_id for update;
  if not found or a.student_id <> v_student then raise exception 'Attempt not found'; end if;
  if a.locked or a.status <> 'in_progress' then raise exception 'Attempt is locked'; end if;
  if now() > a.server_deadline_at then raise exception 'Time expired'; end if;

  insert into public.lms_test_answers (attempt_id, test_question_id, selected_answer, text_answer, save_version)
  values (p_attempt_id, p_test_question_id, p_selected_answer, p_text_answer, 1)
  on conflict (attempt_id, test_question_id) do update
  set selected_answer = excluded.selected_answer,
      text_answer = excluded.text_answer,
      save_version = lms_test_answers.save_version + 1,
      saved_at = now(),
      updated_at = now()
  returning save_version into v_version;

  update public.lms_test_attempts set last_heartbeat_at = now(), updated_at = now() where id = p_attempt_id;

  return jsonb_build_object('ok', true, 'save_version', v_version);
end;
$$;

grant execute on function public.lms_save_test_answer(uuid, uuid, jsonb, text) to authenticated;

-- Submit + objective grade
create or replace function public.lms_submit_test_attempt(
  p_attempt_id uuid,
  p_reason text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  a public.lms_test_attempts%rowtype;
  q public.lms_test_questions%rowtype;
  ans public.lms_test_answers%rowtype;
  v_student uuid := auth.uid();
  v_score numeric(10,2) := 0;
  v_max numeric(10,2) := 0;
  v_status text;
  v_correct boolean;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;
  select * into a from public.lms_test_attempts where id = p_attempt_id for update;
  if not found then raise exception 'Attempt not found'; end if;
  if a.student_id <> v_student and not public.is_admin() and not public.is_mentor_role() then
    raise exception 'Forbidden';
  end if;
  if a.locked then
    return jsonb_build_object('ok', true, 'idempotent', true, 'attempt_id', a.id, 'status', a.status, 'score', a.score);
  end if;

  for q in
    select tq.* from public.lms_test_attempt_questions aq
    join public.lms_test_questions tq on tq.id = aq.test_question_id
    where aq.attempt_id = a.id
  loop
    v_max := v_max + q.marks;
    select * into ans from public.lms_test_answers
    where attempt_id = a.id and test_question_id = q.id;
    if not found then continue; end if;

    v_correct := null;
    if q.question_type in ('single_mcq', 'true_false') then
      v_correct := (ans.selected_answer = q.correct_answer);
    elsif q.question_type = 'multi_mcq' then
      v_correct := (ans.selected_answer = q.correct_answer);
    elsif q.question_type = 'fill_blank' then
      v_correct := lower(btrim(coalesce(ans.text_answer, ''))) = lower(btrim(coalesce(q.correct_answer #>> '{}', q.correct_answer::text, '')));
    end if;

    if v_correct is true then
      v_score := v_score + q.marks;
      update public.lms_test_answers set is_correct = true, awarded_marks = q.marks, is_final = true where id = ans.id;
    elsif v_correct is false then
      update public.lms_test_answers
      set is_correct = false,
          awarded_marks = case when exists(select 1 from public.lms_tests tt where tt.id = a.test_id and tt.negative_marking) then -q.negative_marks else 0 end,
          is_final = true
      where id = ans.id;
      if exists(select 1 from public.lms_tests tt where tt.id = a.test_id and tt.negative_marking) then
        v_score := v_score - q.negative_marks;
      end if;
    else
      update public.lms_test_answers set is_final = true where id = ans.id;
    end if;
  end loop;

  v_status := case
    when p_reason = 'AUTO_SUBMITTED_TIME_EXPIRED' then 'auto_submitted_time'
    when p_reason = 'AUTO_SUBMITTED_TAB_SWITCH' then 'auto_submitted_tab_switch'
    else 'submitted'
  end;

  update public.lms_test_attempts
  set status = v_status,
      locked = true,
      submitted_at = now(),
      submission_reason = p_reason,
      score = v_score,
      max_score = v_max,
      result_status = 'evaluated',
      updated_at = now()
  where id = a.id;

  update public.lms_test_recipients
  set status = 'submitted', updated_at = now()
  where id = a.recipient_id;

  return jsonb_build_object('ok', true, 'attempt_id', a.id, 'status', v_status, 'score', v_score, 'max_score', v_max);
end;
$$;

grant execute on function public.lms_submit_test_attempt(uuid, text) to authenticated;

-- RLS
alter table public.lms_question_bank enable row level security;
alter table public.lms_tests enable row level security;
alter table public.lms_test_questions enable row level security;
alter table public.lms_test_recipients enable row level security;
alter table public.lms_test_attempts enable row level security;
alter table public.lms_test_attempt_questions enable row level security;
alter table public.lms_test_answers enable row level security;

grant select, insert, update, delete on public.lms_question_bank to authenticated;
grant select, insert, update, delete on public.lms_tests to authenticated;
grant select, insert, update, delete on public.lms_test_questions to authenticated;
grant select, insert, update, delete on public.lms_test_recipients to authenticated;
grant select, insert, update on public.lms_test_attempts to authenticated;
grant select, insert on public.lms_test_attempt_questions to authenticated;
grant select, insert, update on public.lms_test_answers to authenticated;

drop policy if exists lms_question_bank_admin_all on public.lms_question_bank;
create policy lms_question_bank_admin_all on public.lms_question_bank for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists lms_question_bank_mentor on public.lms_question_bank;
create policy lms_question_bank_mentor on public.lms_question_bank for all to authenticated
  using (public.is_mentor_role() and created_by = auth.uid())
  with check (public.is_mentor_role());

drop policy if exists lms_tests_admin_all on public.lms_tests;
create policy lms_tests_admin_all on public.lms_tests for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists lms_tests_mentor on public.lms_tests;
create policy lms_tests_mentor on public.lms_tests for all to authenticated
  using (public.is_mentor_role() and (assigned_by = auth.uid() or public.lms_mentor_has_active_allocation(auth.uid(), department_id, course_id, batch_id, module_id)))
  with check (public.is_mentor_role() and public.lms_mentor_has_active_allocation(auth.uid(), department_id, course_id, batch_id, module_id));
drop policy if exists lms_tests_student_select on public.lms_tests;
create policy lms_tests_student_select on public.lms_tests for select to authenticated
  using (exists (select 1 from public.lms_test_recipients r where r.test_id = lms_tests.id and r.student_id = auth.uid()));

drop policy if exists lms_test_questions_admin_all on public.lms_test_questions;
create policy lms_test_questions_admin_all on public.lms_test_questions for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists lms_test_questions_mentor on public.lms_test_questions;
create policy lms_test_questions_mentor on public.lms_test_questions for all to authenticated
  using (exists (select 1 from public.lms_tests t where t.id = test_id and t.assigned_by = auth.uid()))
  with check (exists (select 1 from public.lms_tests t where t.id = test_id and t.assigned_by = auth.uid()));
-- Students see questions only via attempt snapshots (answers/attempt_questions), not bank correct answers on test_questions directly during attempt through
-- Allow select of question text for assigned tests without correct_answer leakage in app layer.
drop policy if exists lms_test_questions_student_select on public.lms_test_questions;
create policy lms_test_questions_student_select on public.lms_test_questions for select to authenticated
  using (exists (
    select 1 from public.lms_test_attempt_questions aq
    join public.lms_test_attempts a on a.id = aq.attempt_id
    where aq.test_question_id = lms_test_questions.id and a.student_id = auth.uid()
  ));

drop policy if exists lms_test_recipients_admin_all on public.lms_test_recipients;
create policy lms_test_recipients_admin_all on public.lms_test_recipients for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists lms_test_recipients_student on public.lms_test_recipients;
create policy lms_test_recipients_student on public.lms_test_recipients for select to authenticated using (student_id = auth.uid());
drop policy if exists lms_test_recipients_mentor on public.lms_test_recipients;
create policy lms_test_recipients_mentor on public.lms_test_recipients for select to authenticated
  using (exists (select 1 from public.lms_tests t where t.id = test_id and t.assigned_by = auth.uid()));

drop policy if exists lms_test_attempts_admin_all on public.lms_test_attempts;
create policy lms_test_attempts_admin_all on public.lms_test_attempts for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists lms_test_attempts_student on public.lms_test_attempts;
create policy lms_test_attempts_student on public.lms_test_attempts for select to authenticated using (student_id = auth.uid());
drop policy if exists lms_test_attempts_student_update on public.lms_test_attempts;
create policy lms_test_attempts_student_update on public.lms_test_attempts for update to authenticated
  using (student_id = auth.uid() and locked = false)
  with check (student_id = auth.uid());
drop policy if exists lms_test_attempts_mentor on public.lms_test_attempts;
create policy lms_test_attempts_mentor on public.lms_test_attempts for select to authenticated
  using (exists (select 1 from public.lms_tests t where t.id = test_id and t.assigned_by = auth.uid()));

drop policy if exists lms_test_attempt_questions_admin on public.lms_test_attempt_questions;
create policy lms_test_attempt_questions_admin on public.lms_test_attempt_questions for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists lms_test_attempt_questions_student on public.lms_test_attempt_questions;
create policy lms_test_attempt_questions_student on public.lms_test_attempt_questions for select to authenticated
  using (exists (select 1 from public.lms_test_attempts a where a.id = attempt_id and a.student_id = auth.uid()));

drop policy if exists lms_test_answers_admin on public.lms_test_answers;
create policy lms_test_answers_admin on public.lms_test_answers for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists lms_test_answers_student on public.lms_test_answers;
create policy lms_test_answers_student on public.lms_test_answers for all to authenticated
  using (exists (select 1 from public.lms_test_attempts a where a.id = attempt_id and a.student_id = auth.uid()))
  with check (exists (select 1 from public.lms_test_attempts a where a.id = attempt_id and a.student_id = auth.uid() and a.locked = false));
drop policy if exists lms_test_answers_mentor on public.lms_test_answers;
create policy lms_test_answers_mentor on public.lms_test_answers for select to authenticated
  using (exists (
    select 1 from public.lms_test_attempts a
    join public.lms_tests t on t.id = a.test_id
    where a.id = attempt_id and t.assigned_by = auth.uid()
  ));

comment on table public.lms_tests is 'LMS tests with server-side attempt timer and publish-time recipients.';
