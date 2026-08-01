-- =============================================================================
-- LMS Phase 2–3 — Audience engine + Assignments (core)
-- Run after: lms_02_mentor_allocations.sql
-- Safe to re-run.
-- =============================================================================

-- Canonical learning item kinds sharing the recipient pattern
create table if not exists public.lms_assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  instructions text,
  department_id uuid not null references public.academic_departments (id) on delete restrict,
  course_id uuid references public.academic_courses (id) on delete set null,
  batch_id uuid references public.academic_batches (id) on delete set null,
  module_id uuid references public.academic_modules (id) on delete set null,
  assignment_type text not null default 'standard',
  difficulty text,
  total_marks numeric(10,2) not null default 100,
  passing_marks numeric(10,2) not null default 40,
  assigned_at timestamptz,
  start_at timestamptz,
  due_at timestamptz,
  late_deadline_at timestamptz,
  allow_late boolean not null default false,
  late_penalty_percent numeric(5,2) not null default 0,
  max_attempts integer not null default 1 check (max_attempts >= 1),
  submission_type text not null default 'combined'
    check (submission_type in (
      'text', 'file', 'multi_file', 'link', 'code', 'combined', 'offline_confirm'
    )),
  allowed_file_formats text[] not null default array['pdf','doc','docx','png','jpg','zip']::text[],
  max_file_size_mb integer not null default 25,
  rubric jsonb not null default '[]'::jsonb,
  reference_attachments jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in (
      'draft', 'scheduled', 'published', 'in_progress', 'due', 'closed', 'archived', 'cancelled'
    )),
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
  constraint lms_assignments_publish_key_unique unique (publish_idempotency_key)
);

create index if not exists lms_assignments_status_idx on public.lms_assignments (status);
create index if not exists lms_assignments_dept_idx on public.lms_assignments (department_id);
create index if not exists lms_assignments_assigned_by_idx on public.lms_assignments (assigned_by);
create index if not exists lms_assignments_due_idx on public.lms_assignments (due_at);

drop trigger if exists lms_assignments_touch on public.lms_assignments;
create trigger lms_assignments_touch
  before update on public.lms_assignments
  for each row execute function public.lms_touch_updated_at();

-- Snapshot recipients at publish time (never rely on dynamic dept membership alone)
create table if not exists public.lms_assignment_recipients (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.lms_assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  enrolment_id uuid references public.student_enrolments (id) on delete set null,
  status text not null default 'assigned'
    check (status in (
      'assigned', 'viewed', 'started', 'submitted', 'submitted_late',
      'resubmission_requested', 'resubmitted', 'evaluated', 'returned',
      'missed', 'exempted'
    )),
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lms_assignment_recipients_unique unique (assignment_id, student_id)
);

create index if not exists lms_assignment_recipients_student_idx
  on public.lms_assignment_recipients (student_id, status);
create index if not exists lms_assignment_recipients_assignment_idx
  on public.lms_assignment_recipients (assignment_id);

drop trigger if exists lms_assignment_recipients_touch on public.lms_assignment_recipients;
create trigger lms_assignment_recipients_touch
  before update on public.lms_assignment_recipients
  for each row execute function public.lms_touch_updated_at();

-- Immutable submission versions
create table if not exists public.lms_assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.lms_assignments (id) on delete cascade,
  recipient_id uuid not null references public.lms_assignment_recipients (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  attempt_number integer not null check (attempt_number >= 1),
  submission_version integer not null check (submission_version >= 1),
  text_response text,
  link_url text,
  code_response text,
  files jsonb not null default '[]'::jsonb,
  is_late boolean not null default false,
  late_duration_minutes integer,
  student_declaration boolean not null default false,
  submitted_at timestamptz not null default now(),
  evaluation_status text not null default 'pending'
    check (evaluation_status in ('pending', 'in_review', 'evaluated', 'returned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lms_assignment_submissions_version_unique
    unique (assignment_id, student_id, attempt_number, submission_version)
);

create index if not exists lms_assignment_submissions_assignment_idx
  on public.lms_assignment_submissions (assignment_id);
create index if not exists lms_assignment_submissions_student_idx
  on public.lms_assignment_submissions (student_id);

create table if not exists public.lms_assignment_evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.lms_assignment_submissions (id) on delete cascade,
  assignment_id uuid not null references public.lms_assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  evaluator_id uuid not null references public.profiles (id) on delete restrict,
  awarded_marks numeric(10,2) not null default 0,
  max_marks numeric(10,2) not null,
  feedback_text text,
  feedback_attachments jsonb not null default '[]'::jsonb,
  rubric_scores jsonb not null default '{}'::jsonb,
  request_resubmission boolean not null default false,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lms_assignment_evaluations_submission_idx
  on public.lms_assignment_evaluations (submission_id);

-- ---------------------------------------------------------------------------
-- Publish assignment + create recipients (transactional RPC)
-- ---------------------------------------------------------------------------

create or replace function public.lms_publish_assignment(
  p_assignment_id uuid,
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
  a public.lms_assignments%rowtype;
  v_ids uuid[];
  v_sid uuid;
  v_count int := 0;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select * into a from public.lms_assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'Assignment not found';
  end if;

  if a.status in ('published', 'in_progress', 'due') and a.publish_idempotency_key is not null
     and p_idempotency_key is not null
     and a.publish_idempotency_key = p_idempotency_key then
    return jsonb_build_object('ok', true, 'idempotent', true, 'assignment_id', a.id);
  end if;

  if not public.is_admin() then
    if not public.lms_mentor_has_active_allocation(
      v_actor, a.department_id, a.course_id, a.batch_id, a.module_id
    ) then
      raise exception 'No active mentor allocation for this scope';
    end if;
    if a.assigned_by <> v_actor and not public.is_admin() then
      raise exception 'Only the assigner or admin can publish';
    end if;
  end if;

  if p_student_ids is not null and array_length(p_student_ids, 1) > 0 then
    v_ids := p_student_ids;
  else
    select coalesce(array_agg(s.student_id), array[]::uuid[])
      into v_ids
    from public.lms_eligible_students_for_scope(a.department_id, a.course_id, a.batch_id) s;
  end if;

  if v_ids is null or array_length(v_ids, 1) is null or array_length(v_ids, 1) = 0 then
    raise exception 'No eligible students for this audience';
  end if;

  foreach v_sid in array v_ids
  loop
    insert into public.lms_assignment_recipients (assignment_id, student_id, enrolment_id)
    select
      a.id,
      v_sid,
      (
        select e.id
        from public.student_enrolments e
        where e.student_id = v_sid
          and e.status = 'active'
          and e.department_id = a.department_id
          and (a.course_id is null or e.course_id = a.course_id)
          and (a.batch_id is null or e.batch_id is null or e.batch_id = a.batch_id)
        order by e.enrolled_at desc
        limit 1
      )
    on conflict (assignment_id, student_id) do nothing;
  end loop;

  select count(*)::int into v_count
  from public.lms_assignment_recipients
  where assignment_id = a.id;

  update public.lms_assignments
  set
    status = case when a.start_at is not null and a.start_at > now() then 'scheduled' else 'published' end,
    assigned_at = coalesce(a.assigned_at, now()),
    published_at = now(),
    publish_idempotency_key = coalesce(p_idempotency_key, a.publish_idempotency_key, gen_random_uuid()::text),
    updated_by = v_actor,
    updated_at = now()
  where id = a.id;

  return jsonb_build_object(
    'ok', true,
    'assignment_id', a.id,
    'recipient_count', v_count
  );
end;
$$;

grant execute on function public.lms_publish_assignment(uuid, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.lms_assignments enable row level security;
alter table public.lms_assignment_recipients enable row level security;
alter table public.lms_assignment_submissions enable row level security;
alter table public.lms_assignment_evaluations enable row level security;

grant select, insert, update, delete on public.lms_assignments to authenticated;
grant select, insert, update, delete on public.lms_assignment_recipients to authenticated;
grant select, insert, update, delete on public.lms_assignment_submissions to authenticated;
grant select, insert, update, delete on public.lms_assignment_evaluations to authenticated;

drop policy if exists lms_assignments_admin_all on public.lms_assignments;
create policy lms_assignments_admin_all on public.lms_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_assignments_mentor_rw on public.lms_assignments;
create policy lms_assignments_mentor_rw on public.lms_assignments
  for all to authenticated
  using (
    public.is_mentor_role()
    and (
      assigned_by = auth.uid()
      or public.lms_mentor_has_active_allocation(auth.uid(), department_id, course_id, batch_id, module_id)
    )
  )
  with check (
    public.is_mentor_role()
    and public.lms_mentor_has_active_allocation(auth.uid(), department_id, course_id, batch_id, module_id)
  );

drop policy if exists lms_assignments_student_select on public.lms_assignments;
create policy lms_assignments_student_select on public.lms_assignments
  for select to authenticated
  using (
    status in ('published', 'in_progress', 'due', 'closed', 'scheduled')
    and exists (
      select 1 from public.lms_assignment_recipients r
      where r.assignment_id = lms_assignments.id
        and r.student_id = auth.uid()
    )
  );

drop policy if exists lms_assignment_recipients_admin_all on public.lms_assignment_recipients;
create policy lms_assignment_recipients_admin_all on public.lms_assignment_recipients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_assignment_recipients_student_select on public.lms_assignment_recipients;
create policy lms_assignment_recipients_student_select on public.lms_assignment_recipients
  for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

drop policy if exists lms_assignment_recipients_student_update on public.lms_assignment_recipients;
create policy lms_assignment_recipients_student_update on public.lms_assignment_recipients
  for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists lms_assignment_recipients_mentor_select on public.lms_assignment_recipients;
create policy lms_assignment_recipients_mentor_select on public.lms_assignment_recipients
  for select to authenticated
  using (
    public.is_mentor_role()
    and exists (
      select 1 from public.lms_assignments a
      where a.id = assignment_id
        and (
          a.assigned_by = auth.uid()
          or public.lms_mentor_has_active_allocation(auth.uid(), a.department_id, a.course_id, a.batch_id, a.module_id)
        )
    )
  );

drop policy if exists lms_assignment_submissions_admin_all on public.lms_assignment_submissions;
create policy lms_assignment_submissions_admin_all on public.lms_assignment_submissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_assignment_submissions_student_rw on public.lms_assignment_submissions;
create policy lms_assignment_submissions_student_rw on public.lms_assignment_submissions
  for all to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists lms_assignment_submissions_mentor_select on public.lms_assignment_submissions;
create policy lms_assignment_submissions_mentor_select on public.lms_assignment_submissions
  for select to authenticated
  using (
    public.is_mentor_role()
    and exists (
      select 1 from public.lms_assignments a
      where a.id = assignment_id
        and (
          a.assigned_by = auth.uid()
          or public.lms_mentor_has_active_allocation(auth.uid(), a.department_id, a.course_id, a.batch_id, a.module_id)
        )
    )
  );

drop policy if exists lms_assignment_evaluations_admin_all on public.lms_assignment_evaluations;
create policy lms_assignment_evaluations_admin_all on public.lms_assignment_evaluations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_assignment_evaluations_mentor_rw on public.lms_assignment_evaluations;
create policy lms_assignment_evaluations_mentor_rw on public.lms_assignment_evaluations
  for all to authenticated
  using (
    public.is_mentor_role()
    and (
      evaluator_id = auth.uid()
      or exists (
        select 1 from public.lms_assignments a
        where a.id = assignment_id and a.assigned_by = auth.uid()
      )
    )
  )
  with check (public.is_mentor_role());

drop policy if exists lms_assignment_evaluations_student_select on public.lms_assignment_evaluations;
create policy lms_assignment_evaluations_student_select on public.lms_assignment_evaluations
  for select to authenticated
  using (student_id = auth.uid());

comment on table public.lms_assignments is 'LMS graded assignments (not ops tasks).';
comment on table public.lms_assignment_recipients is 'Publish-time student snapshot for assignments.';
comment on table public.lms_assignment_submissions is 'Immutable submission versions.';
