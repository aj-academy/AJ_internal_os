-- Run in Supabase SQL Editor if admin delete on attendance / permission rows fails.
-- Root cause: DELETE was not granted to authenticated role (RLS policy alone is not enough).

grant delete on table public.attendance_records to authenticated;
grant delete on table public.permission_requests to authenticated;
grant delete on table public.work_summaries to authenticated;

-- When admin deletes attendance, linked work summaries should go too.
alter table public.work_summaries
  drop constraint if exists work_summaries_attendance_id_fkey;

alter table public.work_summaries
  add constraint work_summaries_attendance_id_fkey
  foreign key (attendance_id) references public.attendance_records(id) on delete cascade;

drop policy if exists work_summary_admin_delete on public.work_summaries;
create policy work_summary_admin_delete
on public.work_summaries
for delete
to authenticated
using (public.is_admin());

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
