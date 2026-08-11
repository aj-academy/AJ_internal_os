-- Phase 6B.1 — drop the LIVE broad profiles SELECT policy (exact name from pg_policy)
-- Confirmed live name: "Authenticated users can read profiles" USING (true)
-- Does NOT disable RLS. Does NOT recreate USING (true).
-- Also ensure student self + mentor-read policies exist (may already be present).

begin;

-- Broad leak (this is why Phase 6B apply appeared to succeed but Student still saw all rows)
drop policy if exists "Authenticated users can read profiles" on public.profiles;

-- Legacy name from profiles_rls_fix.sql (safe no-op if already gone)
drop policy if exists profiles_authenticated_read on public.profiles;

-- Ensure scoped SELECT policies required for Student / Mentor / Admin
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

-- Leave profiles_employee_crm_select, profiles_employee_read_manager, profiles_insert_own untouched
-- unless they already exist (employee CRM / insert stay as-is).

commit;

-- Verify: should NOT list any SELECT policy with using_expression = true
select
  pol.polname as policy_name,
  case pol.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' when '*' then 'ALL' else pol.polcmd::text end as command,
  pol.polpermissive as permissive,
  pg_get_expr(pol.polqual, pol.polrelid) as using_expression
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'profiles'
order by pol.polname;
