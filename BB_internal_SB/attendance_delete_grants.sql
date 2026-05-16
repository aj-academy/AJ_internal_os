-- Run in Supabase SQL Editor if admin delete on attendance / permission rows fails.
-- Root cause: DELETE was not granted to authenticated role (RLS policy alone is not enough).

grant delete on table public.attendance_records to authenticated;
grant delete on table public.permission_requests to authenticated;

drop policy if exists attendance_admin_delete_all on public.attendance_records;
create policy attendance_admin_delete_all
on public.attendance_records
for delete
to authenticated
using (public.is_admin());

drop policy if exists permission_admin_delete on public.permission_requests;
create policy permission_admin_delete
on public.permission_requests
for delete
to authenticated
using (public.is_admin());
