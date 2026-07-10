-- AJ Academy — tighten profiles RLS (run after profiles_rls_fix.sql)
-- Replaces broad "any authenticated user reads all profiles" with scoped policies.

drop policy if exists profiles_authenticated_read on public.profiles;

-- is_admin() must bypass RLS when used inside policies
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (lower(btrim(coalesce(public.get_user_role(), ''))) in ('admin', 'super_admin')),
    false
  );
$$;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select
on public.profiles
for select
to authenticated
using (public.is_admin());

drop policy if exists profiles_mentor_students_select on public.profiles;
create policy profiles_mentor_students_select
on public.profiles
for select
to authenticated
using (
  lower(btrim(coalesce(public.get_user_role(), ''))) = 'mentor'
  and lower(btrim(coalesce(role, ''))) = 'student'
  and (
    assigned_mentor_id = auth.uid()
    or exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.department is not null
        and btrim(me.department) <> ''
        and lower(btrim(me.department)) = lower(btrim(coalesce(profiles.department, '')))
    )
  )
);

drop policy if exists profiles_student_read_mentor on public.profiles;
create policy profiles_student_read_mentor
on public.profiles
for select
to authenticated
using (
  lower(btrim(coalesce(public.get_user_role(), ''))) = 'student'
  and exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.assigned_mentor_id = profiles.id
  )
);

drop policy if exists profiles_employee_read_manager on public.profiles;
create policy profiles_employee_read_manager
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.employee_details ed
    where ed.profile_id = auth.uid()
      and ed.manager_id = profiles.id
  )
);
