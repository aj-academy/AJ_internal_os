-- Run this in Supabase SQL Editor for production.
-- It enables employee check-in/check-out writes and admin attendance visibility.

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

drop policy if exists profiles_admin_read_all on public.profiles;
create policy profiles_admin_read_all
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  )
);

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
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  )
);

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
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  )
);

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
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'super_admin')
  )
);
