
-- =============================================================================
-- LMS — Mentor scope: User Master department + mentee audience
-- Run once in Supabase SQL Editor if publish/create fails with:
--   "No active mentor allocation for this scope"
-- and Audience shows 0 eligible despite Student Management mentor allocation.
--
-- Safe to re-run. Also embedded in lms_mentor_allocations.sql for fresh installs.
-- =============================================================================
create or replace function public.lms_mentor_profile_owns_department(
  p_mentor_id uuid,
  p_department_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  -- User Master department (set when admin creates the mentor) counts as
  -- department-level teaching scope when it matches an academic department name.
  select p_department_id is not null
    and exists (
      select 1
      from public.profiles m
      join public.academic_departments d on d.id = p_department_id
      where m.id = p_mentor_id
        and lower(coalesce(m.role, '')) in ('mentor', 'admin', 'super_admin')
        and nullif(btrim(coalesce(m.department, '')), '') is not null
        and lower(btrim(m.department)) = lower(btrim(d.name))
        and lower(coalesce(d.status, 'active')) = 'active'
    );
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
  )
  or (
    -- User Master department = department-wide scope (course/batch/module optional filters allowed)
    p_department_id is not null
    and public.lms_mentor_profile_owns_department(p_mentor_id, p_department_id)
  );
$$;

-- Mentors who may access a student via allocation, User Master dept, or mentee assignment
create or replace function public.lms_mentor_can_access_student(
  p_mentor_id uuid,
  p_student_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_sma boolean := false;
begin
  if exists (
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
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.profiles m
    join public.profiles s on s.id = p_student_id
    join public.academic_departments d
      on lower(btrim(d.name)) = lower(btrim(coalesce(m.department, '')))
    join public.student_enrolments e
      on e.student_id = s.id
     and e.department_id = d.id
     and e.status = 'active'
    where m.id = p_mentor_id
      and nullif(btrim(coalesce(m.department, '')), '') is not null
      and lower(coalesce(s.role, '')) = 'student'
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.profiles s
    where s.id = p_student_id
      and s.assigned_mentor_id = p_mentor_id
      and lower(coalesce(s.role, '')) = 'student'
  ) then
    return true;
  end if;

  -- student_mentor_assignments is installed later; skip if missing
  if to_regclass('public.student_mentor_assignments') is not null then
    execute
      $q$
      select exists (
        select 1
        from public.student_mentor_assignments a
        where a.mentor_id = $1
          and a.student_id = $2
          and a.status = 'active'
      )
      $q$
      into v_sma
      using p_mentor_id, p_student_id;
    if coalesce(v_sma, false) then
      return true;
    end if;
  end if;

  return false;
end;
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
-- Includes: enrolments in scope, plus mentees (assigned_mentor_id / student_mentor_assignments)
-- when the mentor owns the department scope (Academic allocation or User Master department).
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
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_mentee_ids uuid[] := array[]::uuid[];
  v_sma uuid[];
begin
  if not (
    public.is_admin()
    or public.lms_mentor_has_active_allocation(
      auth.uid(), p_department_id, p_course_id, p_batch_id, null
    )
  ) then
    return;
  end if;

  if not public.is_admin() and auth.uid() is not null then
    select coalesce(array_agg(s.id), array[]::uuid[])
    into v_mentee_ids
    from public.profiles s
    where lower(coalesce(s.role, '')) = 'student'
      and lower(coalesce(s.status, 'active')) = 'active'
      and s.assigned_mentor_id = auth.uid();

    if to_regclass('public.student_mentor_assignments') is not null then
      execute
        $q$
        select coalesce(array_agg(a.student_id), array[]::uuid[])
        from public.student_mentor_assignments a
        where a.mentor_id = $1
          and a.status = 'active'
        $q$
        into v_sma
        using auth.uid();
      v_mentee_ids := (
        select coalesce(array_agg(distinct x), array[]::uuid[])
        from unnest(coalesce(v_mentee_ids, array[]::uuid[]) || coalesce(v_sma, array[]::uuid[])) as t(x)
      );
    end if;
  end if;

  return query
  with enrolled as (
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
  ),
  mentees as (
    select
      s.id as student_id,
      s.full_name,
      s.email,
      (
        select e.id
        from public.student_enrolments e
        where e.student_id = s.id
          and e.status = 'active'
          and e.department_id = p_department_id
          and (p_course_id is null or e.course_id = p_course_id)
          and (p_batch_id is null or e.batch_id is null or e.batch_id = p_batch_id)
        order by e.enrolled_at desc nulls last
        limit 1
      ) as enrolment_id,
      (
        select e.course_id
        from public.student_enrolments e
        where e.student_id = s.id
          and e.status = 'active'
          and e.department_id = p_department_id
        order by e.enrolled_at desc nulls last
        limit 1
      ) as course_id,
      (
        select e.batch_id
        from public.student_enrolments e
        where e.student_id = s.id
          and e.status = 'active'
          and e.department_id = p_department_id
        order by e.enrolled_at desc nulls last
        limit 1
      ) as batch_id
    from public.profiles s
    where s.id = any (v_mentee_ids)
  )
  select distinct on (u.student_id)
    u.student_id,
    u.full_name,
    u.email,
    u.enrolment_id,
    u.course_id,
    u.batch_id
  from (
    select * from enrolled
    union all
    select * from mentees
  ) u
  order by u.student_id, u.enrolment_id nulls last, coalesce(u.full_name, u.email, u.student_id::text);
end;
$$;

grant execute on function public.lms_eligible_students_for_scope(uuid, uuid, uuid) to authenticated;
grant execute on function public.lms_mentor_profile_owns_department(uuid, uuid) to authenticated;
