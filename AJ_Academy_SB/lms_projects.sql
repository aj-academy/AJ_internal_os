-- =============================================================================
-- LMS — Academic projects (milestones + teams)
-- Run after: lms_assignments.sql (or at least lms_mentor_allocations.sql)
-- Safe to re-run. Separate from ops Project Master (`projects`).
-- =============================================================================

do $$
begin
  if to_regprocedure('public.lms_mentor_has_active_allocation(uuid,uuid,uuid,uuid,uuid)') is null then
    raise exception 'Missing lms_mentor_has_active_allocation — run lms_mentor_allocations.sql first.';
  end if;
end $$;

create table if not exists public.lms_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  problem_statement text,
  description text,
  expected_outcome text,
  department_id uuid not null references public.academic_departments (id) on delete restrict,
  course_id uuid references public.academic_courses (id) on delete set null,
  batch_id uuid references public.academic_batches (id) on delete set null,
  module_id uuid references public.academic_modules (id) on delete set null,
  project_category text,
  team_mode text not null default 'individual'
    check (team_mode in ('individual', 'mentor_team', 'student_team', 'batch')),
  start_date date,
  final_deadline date,
  total_marks numeric(10,2) not null default 100,
  guide_mentor_id uuid references public.profiles (id) on delete set null,
  skills_covered text[] not null default '{}'::text[],
  technologies_expected text[] not null default '{}'::text[],
  reference_materials jsonb not null default '[]'::jsonb,
  submission_requirements text,
  presentation_required boolean not null default false,
  viva_required boolean not null default false,
  status text not null default 'draft'
    check (status in (
      'draft', 'assigned', 'topic_pending', 'topic_approved', 'proposal_submitted',
      'in_progress', 'review_pending', 'revision_required', 'final_submission',
      'completed', 'evaluated', 'cancelled', 'archived'
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
  constraint lms_projects_publish_key_unique unique (publish_idempotency_key)
);

create index if not exists lms_projects_dept_idx on public.lms_projects (department_id);
create index if not exists lms_projects_status_idx on public.lms_projects (status);
create index if not exists lms_projects_assigned_by_idx on public.lms_projects (assigned_by);

drop trigger if exists lms_projects_touch on public.lms_projects;
create trigger lms_projects_touch
  before update on public.lms_projects
  for each row execute function public.lms_touch_updated_at();

create table if not exists public.lms_project_recipients (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.lms_projects (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  enrolment_id uuid references public.student_enrolments (id) on delete set null,
  status text not null default 'assigned'
    check (status in (
      'assigned', 'topic_pending', 'topic_approved', 'in_progress',
      'review_pending', 'revision_required', 'final_submission',
      'completed', 'evaluated', 'cancelled'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lms_project_recipients_unique unique (project_id, student_id)
);

create index if not exists lms_project_recipients_student_idx
  on public.lms_project_recipients (student_id);

drop trigger if exists lms_project_recipients_touch on public.lms_project_recipients;
create trigger lms_project_recipients_touch
  before update on public.lms_project_recipients
  for each row execute function public.lms_touch_updated_at();

create table if not exists public.lms_project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.lms_projects (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  team_name text,
  is_leader boolean not null default false,
  contribution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lms_project_members_unique unique (project_id, student_id)
);

create table if not exists public.lms_project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.lms_projects (id) on delete cascade,
  title text not null,
  milestone_key text,
  instructions text,
  due_date date,
  sort_order integer not null default 0,
  required_attachments boolean not null default false,
  max_marks numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lms_project_milestones_project_idx
  on public.lms_project_milestones (project_id, sort_order);

drop trigger if exists lms_project_milestones_touch on public.lms_project_milestones;
create trigger lms_project_milestones_touch
  before update on public.lms_project_milestones
  for each row execute function public.lms_touch_updated_at();

create table if not exists public.lms_project_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.lms_projects (id) on delete cascade,
  milestone_id uuid references public.lms_project_milestones (id) on delete set null,
  student_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid references public.lms_project_recipients (id) on delete set null,
  submission_version integer not null default 1,
  text_response text,
  github_url text,
  demo_url text,
  files jsonb not null default '[]'::jsonb,
  status text not null default 'submitted'
    check (status in ('draft', 'submitted', 'revision_required', 'approved', 'evaluated')),
  mentor_feedback text,
  marks numeric(10,2),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lms_project_submissions_project_idx
  on public.lms_project_submissions (project_id, student_id);

-- Publish project + snapshot recipients
create or replace function public.lms_publish_project(
  p_project_id uuid,
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
  p public.lms_projects%rowtype;
  v_ids uuid[];
  v_sid uuid;
  v_count int := 0;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;

  select * into p from public.lms_projects where id = p_project_id for update;
  if not found then raise exception 'Project not found'; end if;

  if p.status not in ('draft', 'cancelled') and p.publish_idempotency_key is not null
     and p_idempotency_key is not null
     and p.publish_idempotency_key = p_idempotency_key then
    return jsonb_build_object('ok', true, 'idempotent', true, 'project_id', p.id);
  end if;

  if not public.is_admin() then
    if not public.lms_mentor_has_active_allocation(
      v_actor, p.department_id, p.course_id, p.batch_id, p.module_id
    ) then
      raise exception 'No active mentor allocation for this scope';
    end if;
    if p.assigned_by <> v_actor then
      raise exception 'Only the assigner or admin can publish';
    end if;
  end if;

  if p_student_ids is not null and array_length(p_student_ids, 1) > 0 then
    v_ids := p_student_ids;
  else
    select coalesce(array_agg(s.student_id), array[]::uuid[])
      into v_ids
    from public.lms_eligible_students_for_scope(p.department_id, p.course_id, p.batch_id) s;
  end if;

  if v_ids is null or coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'No eligible students for this audience';
  end if;

  foreach v_sid in array v_ids
  loop
    insert into public.lms_project_recipients (project_id, student_id, enrolment_id)
    values (
      p.id,
      v_sid,
      (
        select e.id from public.student_enrolments e
        where e.student_id = v_sid and e.status = 'active'
          and e.department_id = p.department_id
          and (p.course_id is null or e.course_id = p.course_id)
          and (p.batch_id is null or e.batch_id is null or e.batch_id = p.batch_id)
        order by e.enrolled_at desc limit 1
      )
    )
    on conflict (project_id, student_id) do nothing;

    insert into public.lms_project_members (project_id, student_id, is_leader)
    values (p.id, v_sid, false)
    on conflict (project_id, student_id) do nothing;
  end loop;

  select count(*)::int into v_count from public.lms_project_recipients where project_id = p.id;

  update public.lms_projects
  set
    status = 'assigned',
    published_at = now(),
    publish_idempotency_key = coalesce(p_idempotency_key, p.publish_idempotency_key, gen_random_uuid()::text),
    updated_by = v_actor,
    updated_at = now()
  where id = p.id;

  return jsonb_build_object('ok', true, 'project_id', p.id, 'recipient_count', v_count);
end;
$$;

grant execute on function public.lms_publish_project(uuid, uuid[], text) to authenticated;

-- Default milestones helper
create or replace function public.lms_seed_default_project_milestones(p_project_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count int := 0;
begin
  if exists (select 1 from public.lms_project_milestones where project_id = p_project_id) then
    return 0;
  end if;

  insert into public.lms_project_milestones (project_id, title, milestone_key, sort_order, max_marks)
  values
    (p_project_id, 'Topic selection', 'topic_selection', 10, 5),
    (p_project_id, 'Proposal submission', 'proposal', 20, 10),
    (p_project_id, 'Requirement analysis', 'requirements', 30, 10),
    (p_project_id, 'Design', 'design', 40, 10),
    (p_project_id, 'Development', 'development', 50, 25),
    (p_project_id, 'Mid-review', 'mid_review', 60, 10),
    (p_project_id, 'Testing', 'testing', 70, 10),
    (p_project_id, 'Documentation', 'documentation', 80, 10),
    (p_project_id, 'Final submission', 'final', 90, 5),
    (p_project_id, 'Presentation', 'presentation', 100, 3),
    (p_project_id, 'Viva', 'viva', 110, 2);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.lms_seed_default_project_milestones(uuid) to authenticated;

-- Helpers so RLS policies do not recurse across projects ↔ recipients
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

grant execute on function public.lms_project_student_is_recipient(uuid, uuid) to authenticated;
grant execute on function public.lms_project_mentor_can_access(uuid, uuid) to authenticated;

-- RLS
alter table public.lms_projects enable row level security;
alter table public.lms_project_recipients enable row level security;
alter table public.lms_project_members enable row level security;
alter table public.lms_project_milestones enable row level security;
alter table public.lms_project_submissions enable row level security;

grant select, insert, update, delete on public.lms_projects to authenticated;
grant select, insert, update, delete on public.lms_project_recipients to authenticated;
grant select, insert, update, delete on public.lms_project_members to authenticated;
grant select, insert, update, delete on public.lms_project_milestones to authenticated;
grant select, insert, update, delete on public.lms_project_submissions to authenticated;

drop policy if exists lms_projects_admin_all on public.lms_projects;
create policy lms_projects_admin_all on public.lms_projects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_projects_mentor_rw on public.lms_projects;
create policy lms_projects_mentor_rw on public.lms_projects
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

drop policy if exists lms_projects_student_select on public.lms_projects;
create policy lms_projects_student_select on public.lms_projects
  for select to authenticated
  using (public.lms_project_student_is_recipient(id, auth.uid()));

drop policy if exists lms_project_recipients_admin_all on public.lms_project_recipients;
create policy lms_project_recipients_admin_all on public.lms_project_recipients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_project_recipients_student_select on public.lms_project_recipients;
create policy lms_project_recipients_student_select on public.lms_project_recipients
  for select to authenticated using (student_id = auth.uid() or public.is_admin());

drop policy if exists lms_project_recipients_mentor_select on public.lms_project_recipients;
create policy lms_project_recipients_mentor_select on public.lms_project_recipients
  for select to authenticated
  using (
    public.is_mentor_role()
    and public.lms_project_mentor_can_access(project_id, auth.uid())
  );

drop policy if exists lms_project_members_admin_all on public.lms_project_members;
create policy lms_project_members_admin_all on public.lms_project_members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

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

drop policy if exists lms_project_milestones_admin_all on public.lms_project_milestones;
create policy lms_project_milestones_admin_all on public.lms_project_milestones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

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

drop policy if exists lms_project_submissions_admin_all on public.lms_project_submissions;
create policy lms_project_submissions_admin_all on public.lms_project_submissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_project_submissions_student_rw on public.lms_project_submissions;
create policy lms_project_submissions_student_rw on public.lms_project_submissions
  for all to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists lms_project_submissions_mentor_select on public.lms_project_submissions;
create policy lms_project_submissions_mentor_select on public.lms_project_submissions
  for select to authenticated
  using (
    public.is_mentor_role()
    and public.lms_project_mentor_can_access(project_id, auth.uid())
  );

comment on table public.lms_projects is 'Academic LMS projects (not ops Project Master).';
