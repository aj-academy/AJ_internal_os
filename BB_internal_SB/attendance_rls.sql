-- Run this in Supabase SQL Editor for production.
-- It enables employee check-in/check-out writes and admin attendance visibility.
--
-- Prefer one file: BB_internal_SB/attendance_module.sql (tables + helpers + this RLS in order).
-- Requires public.get_user_role() and public.is_admin() (from schema.sql step 1, or Section A of attendance_module.sql).
-- If you see: function public.is_admin() does not exist — run attendance_rls_prereqs.sql or attendance_module.sql Section A first.

grant usage on schema public to authenticated;

grant select, insert, update on table public.attendance_records to authenticated;
grant select, insert, update on table public.work_summaries to authenticated;
grant select, insert, update on table public.permission_requests to authenticated;
grant select on table public.profiles to authenticated;

alter table public.attendance_records enable row level security;
alter table public.work_summaries enable row level security;
alter table public.permission_requests enable row level security;
alter table public.profiles enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_self_read_by_email on public.profiles;
create policy profiles_self_read_by_email
on public.profiles
for select
to authenticated
using (
  lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
);

-- Use is_admin() (security definer) instead of EXISTS on profiles here to avoid
-- PostgreSQL RLS infinite recursion / 500 errors on profiles SELECT after login.
drop policy if exists profiles_admin_read_all on public.profiles;
create policy profiles_admin_read_all
on public.profiles
for select
to authenticated
using (public.is_admin());

-- Remove legacy permissive policy if present (reads all profiles; not needed once get_user_role bypasses RLS).
drop policy if exists profiles_authenticated_read_all on public.profiles;

drop policy if exists attendance_employee_own on public.attendance_records;
create policy attendance_employee_own
on public.attendance_records
for all
to authenticated
using (employee_id = auth.uid())
with check (employee_id = auth.uid());

drop policy if exists attendance_admin_read_all on public.attendance_records;
create policy attendance_admin_read_all
on public.attendance_records
for select
to authenticated
using (public.is_admin());

drop policy if exists work_summary_employee_own on public.work_summaries;
create policy work_summary_employee_own
on public.work_summaries
for all
to authenticated
using (employee_id = auth.uid())
with check (employee_id = auth.uid());

drop policy if exists work_summary_admin_read_update on public.work_summaries;
create policy work_summary_admin_read_update
on public.work_summaries
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists permission_employee_own on public.permission_requests;
create policy permission_employee_own
on public.permission_requests
for all
to authenticated
using (employee_id = auth.uid())
with check (employee_id = auth.uid());

drop policy if exists permission_admin_read_update on public.permission_requests;
create policy permission_admin_read_update
on public.permission_requests
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
