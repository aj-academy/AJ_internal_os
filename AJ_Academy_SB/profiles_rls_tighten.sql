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

create or replace function public.get_my_department()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select department from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.get_my_assigned_mentor_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select assigned_mentor_id from public.profiles where id = auth.uid() limit 1;
$$;

grant execute on function public.get_my_department() to authenticated;
grant execute on function public.get_my_assigned_mentor_id() to authenticated;

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
    or (
      btrim(coalesce(public.get_my_department(), '')) <> ''
      and lower(btrim(coalesce(public.get_my_department(), ''))) = lower(btrim(coalesce(department, '')))
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
  and public.get_my_assigned_mentor_id() = id
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
