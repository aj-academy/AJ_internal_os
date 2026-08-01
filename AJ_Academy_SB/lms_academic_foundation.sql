-- =============================================================================
-- LMS Phase 1a — Academic foundation
-- Run after: schema.sql, system_settings (optional), aj_academy_platform_expansion.sql
-- Safe to re-run.
-- =============================================================================

create extension if not exists pgcrypto;

-- Departments (normalized; seeded from Settings hr_org / profile strings)
create table if not exists public.academic_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  description text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint academic_departments_name_unique unique (name)
);

create index if not exists academic_departments_status_idx
  on public.academic_departments (status);

-- Courses belong to a department
create table if not exists public.academic_courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.academic_departments (id) on delete restrict,
  name text not null,
  code text,
  description text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint academic_courses_dept_name_unique unique (department_id, name)
);

create index if not exists academic_courses_department_idx
  on public.academic_courses (department_id);
create index if not exists academic_courses_status_idx
  on public.academic_courses (status);

-- Batches / cohorts within a course
create table if not exists public.academic_batches (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academic_courses (id) on delete restrict,
  name text not null,
  academic_year text,
  start_date date,
  end_date date,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint academic_batches_course_name_unique unique (course_id, name)
);

create index if not exists academic_batches_course_idx
  on public.academic_batches (course_id);
create index if not exists academic_batches_status_idx
  on public.academic_batches (status);

-- Subjects / modules within a course
create table if not exists public.academic_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.academic_courses (id) on delete restrict,
  name text not null,
  code text,
  description text,
  sort_order integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint academic_modules_course_name_unique unique (course_id, name)
);

create index if not exists academic_modules_course_idx
  on public.academic_modules (course_id);

-- Student enrolment (portal profiles only — not CRM clients)
create table if not exists public.student_enrolments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  department_id uuid not null references public.academic_departments (id) on delete restrict,
  course_id uuid not null references public.academic_courses (id) on delete restrict,
  batch_id uuid references public.academic_batches (id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'withdrawn', 'transferred', 'suspended')),
  enrolled_at date not null default (timezone('utc', now()))::date,
  ended_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null
);

create index if not exists student_enrolments_student_idx
  on public.student_enrolments (student_id);
create index if not exists student_enrolments_batch_idx
  on public.student_enrolments (batch_id);
create index if not exists student_enrolments_course_idx
  on public.student_enrolments (course_id);
create index if not exists student_enrolments_dept_idx
  on public.student_enrolments (department_id);
create index if not exists student_enrolments_active_idx
  on public.student_enrolments (status)
  where status = 'active';

-- One active enrolment per student+course (transfers close prior rows)
create unique index if not exists student_enrolments_active_student_course_uidx
  on public.student_enrolments (student_id, course_id)
  where status = 'active';

comment on table public.academic_departments is 'LMS departments (normalized). Seeded from hr_org / profile labels.';
comment on table public.academic_courses is 'LMS courses under a department.';
comment on table public.academic_batches is 'LMS batches/cohorts under a course.';
comment on table public.academic_modules is 'LMS subjects/modules under a course.';
comment on table public.student_enrolments is 'Portal student enrolment history. CRM clients are not enrolled here.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.lms_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists academic_departments_touch on public.academic_departments;
create trigger academic_departments_touch
  before update on public.academic_departments
  for each row execute function public.lms_touch_updated_at();

drop trigger if exists academic_courses_touch on public.academic_courses;
create trigger academic_courses_touch
  before update on public.academic_courses
  for each row execute function public.lms_touch_updated_at();

drop trigger if exists academic_batches_touch on public.academic_batches;
create trigger academic_batches_touch
  before update on public.academic_batches
  for each row execute function public.lms_touch_updated_at();

drop trigger if exists academic_modules_touch on public.academic_modules;
create trigger academic_modules_touch
  before update on public.academic_modules
  for each row execute function public.lms_touch_updated_at();

drop trigger if exists student_enrolments_touch on public.student_enrolments;
create trigger student_enrolments_touch
  before update on public.student_enrolments
  for each row execute function public.lms_touch_updated_at();

-- Ensure department by name (case-insensitive)
create or replace function public.lms_ensure_department(p_name text, p_actor uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if v_name is null then
    raise exception 'Department name is required';
  end if;
  select d.id into v_id
  from public.academic_departments d
  where lower(d.name) = lower(v_name)
  limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.academic_departments (name, created_by, updated_by)
  values (v_name, p_actor, p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.lms_ensure_course(
  p_department_id uuid,
  p_name text,
  p_actor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if p_department_id is null then
    raise exception 'department_id is required';
  end if;
  if v_name is null then
    raise exception 'Course name is required';
  end if;
  select c.id into v_id
  from public.academic_courses c
  where c.department_id = p_department_id
    and lower(c.name) = lower(v_name)
  limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.academic_courses (department_id, name, created_by, updated_by)
  values (p_department_id, v_name, p_actor, p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

-- Seed departments/courses from system_settings.hr_org + distinct profile labels
create or replace function public.lms_seed_academic_from_settings(p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_settings jsonb;
  v_dept text;
  v_course text;
  v_dept_id uuid;
  v_depts int := 0;
  v_courses int := 0;
  v_default_dept_id uuid;
begin
  select s.setting_value into v_settings
  from public.system_settings s
  where s.setting_key = 'hr_org'
  limit 1;

  if v_settings is not null and jsonb_typeof(v_settings->'departments') = 'array' then
    for v_dept in
      select distinct nullif(btrim(x), '')
      from jsonb_array_elements_text(v_settings->'departments') as t(x)
      where nullif(btrim(x), '') is not null
    loop
      perform public.lms_ensure_department(v_dept, p_actor);
      v_depts := v_depts + 1;
    end loop;
  end if;

  -- Profile department labels
  for v_dept in
    select distinct nullif(btrim(p.department), '')
    from public.profiles p
    where nullif(btrim(p.department), '') is not null
  loop
    perform public.lms_ensure_department(v_dept, p_actor);
    v_depts := v_depts + 1;
  end loop;

  -- Prefer Engineering / first active department as default course parent
  select d.id into v_default_dept_id
  from public.academic_departments d
  where d.status = 'active'
  order by case when lower(d.name) = 'engineering' then 0 else 1 end, d.name
  limit 1;

  if v_default_dept_id is null then
    v_default_dept_id := public.lms_ensure_department('General', p_actor);
  end if;

  if v_settings is not null and jsonb_typeof(v_settings->'courses') = 'array' then
    for v_course in
      select distinct nullif(btrim(x), '')
      from jsonb_array_elements_text(v_settings->'courses') as t(x)
      where nullif(btrim(x), '') is not null
    loop
      perform public.lms_ensure_course(v_default_dept_id, v_course, p_actor);
      v_courses := v_courses + 1;
    end loop;
  end if;

  for v_course in
    select distinct nullif(btrim(p.course), '')
    from public.profiles p
    where nullif(btrim(p.course), '') is not null
  loop
    -- Attach course under the student's department when possible
    null; -- handled in enrolment backfill
    perform public.lms_ensure_course(v_default_dept_id, v_course, p_actor);
    v_courses := v_courses + 1;
  end loop;

  return jsonb_build_object('departments_touched', v_depts, 'courses_touched', v_courses);
end;
$$;

-- Backfill active enrolments for portal students from profile department/course
create or replace function public.lms_backfill_student_enrolments(p_actor uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r record;
  v_dept_id uuid;
  v_course_id uuid;
  v_count int := 0;
begin
  for r in
    select p.id, p.department, p.course
    from public.profiles p
    where lower(coalesce(p.role, '')) = 'student'
      and lower(coalesce(p.status, 'active')) = 'active'
  loop
    if nullif(btrim(coalesce(r.department, '')), '') is null
       and nullif(btrim(coalesce(r.course, '')), '') is null then
      continue;
    end if;

    v_dept_id := public.lms_ensure_department(
      coalesce(nullif(btrim(r.department), ''), 'General'),
      p_actor
    );
    v_course_id := public.lms_ensure_course(
      v_dept_id,
      coalesce(nullif(btrim(r.course), ''), 'General Course'),
      p_actor
    );

    if exists (
      select 1 from public.student_enrolments e
      where e.student_id = r.id and e.course_id = v_course_id and e.status = 'active'
    ) then
      continue;
    end if;

    insert into public.student_enrolments (
      student_id, department_id, course_id, status, created_by, updated_by
    )
    values (r.id, v_dept_id, v_course_id, 'active', p_actor, p_actor);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.lms_ensure_department(text, uuid) to authenticated;
grant execute on function public.lms_ensure_course(uuid, text, uuid) to authenticated;
grant execute on function public.lms_seed_academic_from_settings(uuid) to authenticated;
grant execute on function public.lms_backfill_student_enrolments(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.academic_departments enable row level security;
alter table public.academic_courses enable row level security;
alter table public.academic_batches enable row level security;
alter table public.academic_modules enable row level security;
alter table public.student_enrolments enable row level security;

grant select, insert, update, delete on public.academic_departments to authenticated;
grant select, insert, update, delete on public.academic_courses to authenticated;
grant select, insert, update, delete on public.academic_batches to authenticated;
grant select, insert, update, delete on public.academic_modules to authenticated;
grant select, insert, update, delete on public.student_enrolments to authenticated;

-- Admin: full access
drop policy if exists academic_departments_admin_all on public.academic_departments;
create policy academic_departments_admin_all on public.academic_departments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists academic_courses_admin_all on public.academic_courses;
create policy academic_courses_admin_all on public.academic_courses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists academic_batches_admin_all on public.academic_batches;
create policy academic_batches_admin_all on public.academic_batches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists academic_modules_admin_all on public.academic_modules;
create policy academic_modules_admin_all on public.academic_modules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists student_enrolments_admin_all on public.student_enrolments;
create policy student_enrolments_admin_all on public.student_enrolments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Authenticated read of active academic structure (needed for pickers)
drop policy if exists academic_departments_read on public.academic_departments;
create policy academic_departments_read on public.academic_departments
  for select to authenticated using (status = 'active' or public.is_admin());

drop policy if exists academic_courses_read on public.academic_courses;
create policy academic_courses_read on public.academic_courses
  for select to authenticated using (status = 'active' or public.is_admin());

drop policy if exists academic_batches_read on public.academic_batches;
create policy academic_batches_read on public.academic_batches
  for select to authenticated using (status = 'active' or public.is_admin());

drop policy if exists academic_modules_read on public.academic_modules;
create policy academic_modules_read on public.academic_modules
  for select to authenticated using (status = 'active' or public.is_admin());

-- Students read own enrolments
drop policy if exists student_enrolments_self_select on public.student_enrolments;
create policy student_enrolments_self_select on public.student_enrolments
  for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

-- Mentors: enrolment select scoped in lms_mentor_allocations.sql (after allocations exist)
