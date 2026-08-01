-- =============================================================================
-- LMS Phase 1b — Mentor allocations (effective-dated)
-- Run after: lms_01_academic_foundation.sql, aj_academy_platform_expansion.sql
-- Safe to re-run.
-- =============================================================================

create table if not exists public.mentor_allocations (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles (id) on delete restrict,
  department_id uuid not null references public.academic_departments (id) on delete restrict,
  course_id uuid references public.academic_courses (id) on delete set null,
  batch_id uuid references public.academic_batches (id) on delete set null,
  module_id uuid references public.academic_modules (id) on delete set null,
  start_date date not null default (timezone('utc', now()))::date,
  end_date date,
  is_primary boolean not null default true,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'expired', 'revoked')),
  assigned_by uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint mentor_allocations_dates_chk
    check (end_date is null or end_date >= start_date)
);

create index if not exists mentor_allocations_mentor_idx
  on public.mentor_allocations (mentor_id);
create index if not exists mentor_allocations_dept_idx
  on public.mentor_allocations (department_id);
create index if not exists mentor_allocations_course_idx
  on public.mentor_allocations (course_id);
create index if not exists mentor_allocations_batch_idx
  on public.mentor_allocations (batch_id);
create index if not exists mentor_allocations_status_idx
  on public.mentor_allocations (status);
create index if not exists mentor_allocations_active_window_idx
  on public.mentor_allocations (mentor_id, status, start_date, end_date);

comment on table public.mentor_allocations is
  'Effective-dated mentor scope. Historical rows are kept (status revoked/expired); never delete for history.';

drop trigger if exists mentor_allocations_touch on public.mentor_allocations;
create trigger mentor_allocations_touch
  before update on public.mentor_allocations
  for each row execute function public.lms_touch_updated_at();

-- Active allocation check (date window + status)
create or replace function public.lms_allocation_is_effective(
  p_status text,
  p_start_date date,
  p_end_date date
)
returns boolean
language sql
stable
as $$
  select p_status = 'active'
    and p_start_date <= (timezone('utc', now()))::date
    and (p_end_date is null or p_end_date >= (timezone('utc', now()))::date);
$$;

create or replace function public.lms_mentor_has_active_allocation(
  p_mentor_id uuid,
  p_department_id uuid default null,
  p_course_id uuid default null,
  p_batch_id uuid default null,
  p_module_id uuid default null
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
    from public.mentor_allocations a
    where a.mentor_id = p_mentor_id
      and public.lms_allocation_is_effective(a.status, a.start_date, a.end_date)
      and (p_department_id is null or a.department_id = p_department_id)
      and (p_course_id is null or a.course_id is null or a.course_id = p_course_id)
      and (p_batch_id is null or a.batch_id is null or a.batch_id = p_batch_id)
      and (p_module_id is null or a.module_id is null or a.module_id = p_module_id)
  );
$$;

-- Mentors who may access a student via active allocation ∩ active enrolment
create or replace function public.lms_mentor_can_access_student(
  p_mentor_id uuid,
  p_student_id uuid
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
    from public.mentor_allocations a
    join public.student_enrolments e
      on e.department_id = a.department_id
     and e.status = 'active'
     and e.student_id = p_student_id
     and (a.course_id is null or e.course_id = a.course_id)
     and (a.batch_id is null or e.batch_id is null or e.batch_id = a.batch_id)
    where a.mentor_id = p_mentor_id
      and public.lms_allocation_is_effective(a.status, a.start_date, a.end_date)
  )
  or exists (
    -- Legacy fallback: primary assigned_mentor_id (counselling era)
    select 1
    from public.profiles s
    where s.id = p_student_id
      and s.assigned_mentor_id = p_mentor_id
      and lower(coalesce(s.role, '')) = 'student'
  );
$$;

create or replace function public.lms_current_mentor_can_access_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_admin()
    or (
      public.is_mentor_role()
      and public.lms_mentor_can_access_student(auth.uid(), p_student_id)
    );
$$;

grant execute on function public.lms_mentor_has_active_allocation(uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.lms_mentor_can_access_student(uuid, uuid) to authenticated;
grant execute on function public.lms_current_mentor_can_access_student(uuid) to authenticated;

-- Eligible students for a mentor allocation scope
create or replace function public.lms_eligible_students_for_scope(
  p_department_id uuid,
  p_course_id uuid default null,
  p_batch_id uuid default null
)
returns table (
  student_id uuid,
  full_name text,
  email text,
  enrolment_id uuid,
  course_id uuid,
  batch_id uuid
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    e.student_id,
    p.full_name,
    p.email,
    e.id as enrolment_id,
    e.course_id,
    e.batch_id
  from public.student_enrolments e
  join public.profiles p on p.id = e.student_id
  where e.status = 'active'
    and e.department_id = p_department_id
    and (p_course_id is null or e.course_id = p_course_id)
    and (p_batch_id is null or e.batch_id = p_batch_id)
    and lower(coalesce(p.role, '')) = 'student'
    and lower(coalesce(p.status, 'active')) = 'active'
    and (
      public.is_admin()
      or public.lms_mentor_has_active_allocation(auth.uid(), p_department_id, p_course_id, p_batch_id, null)
    )
  order by coalesce(p.full_name, p.email, p.id::text);
$$;

grant execute on function public.lms_eligible_students_for_scope(uuid, uuid, uuid) to authenticated;

-- Expire past-end allocations (idempotent maintenance)
create or replace function public.lms_expire_mentor_allocations()
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count int;
begin
  update public.mentor_allocations
  set status = 'expired', updated_at = now()
  where status = 'active'
    and end_date is not null
    and end_date < (timezone('utc', now()))::date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.lms_expire_mentor_allocations() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.mentor_allocations enable row level security;
grant select, insert, update, delete on public.mentor_allocations to authenticated;

drop policy if exists mentor_allocations_admin_all on public.mentor_allocations;
create policy mentor_allocations_admin_all on public.mentor_allocations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists mentor_allocations_self_select on public.mentor_allocations;
create policy mentor_allocations_self_select on public.mentor_allocations
  for select to authenticated
  using (mentor_id = auth.uid() or public.is_admin());

-- Mentors may read enrolments in their active allocation scope
drop policy if exists student_enrolments_mentor_select on public.student_enrolments;
create policy student_enrolments_mentor_select on public.student_enrolments
  for select to authenticated
  using (
    public.is_admin()
    or student_id = auth.uid()
    or (
      public.is_mentor_role()
      and public.lms_mentor_has_active_allocation(
        auth.uid(),
        department_id,
        course_id,
        batch_id,
        null
      )
    )
  );

-- Optional: sync primary assigned_mentor_id when primary allocation is created
create or replace function public.lms_sync_primary_assigned_mentor()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if new.is_primary and public.lms_allocation_is_effective(new.status, new.start_date, new.end_date) then
      -- Soft hint only: set assigned_mentor_id for students in scope who have none
      update public.profiles p
      set assigned_mentor_id = new.mentor_id
      where lower(coalesce(p.role, '')) = 'student'
        and p.assigned_mentor_id is null
        and exists (
          select 1
          from public.student_enrolments e
          where e.student_id = p.id
            and e.status = 'active'
            and e.department_id = new.department_id
            and (new.course_id is null or e.course_id = new.course_id)
            and (new.batch_id is null or e.batch_id is null or e.batch_id = new.batch_id)
        );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mentor_allocations_sync_primary on public.mentor_allocations;
create trigger mentor_allocations_sync_primary
  after insert or update on public.mentor_allocations
  for each row execute function public.lms_sync_primary_assigned_mentor();
