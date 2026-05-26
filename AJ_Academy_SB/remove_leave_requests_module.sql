-- AJ Academy — remove duplicate leave_requests module
-- Use permission_requests in Admin → Attendance → Permission Requests instead.
-- Safe to re-run. Run in Supabase SQL Editor after backing up data if needed.

drop function if exists public.create_leave_request_notification(uuid);
drop function if exists public.create_leave_status_notification(uuid);

drop policy if exists leave_own_all on public.leave_requests;
drop policy if exists leave_admin_all on public.leave_requests;
drop policy if exists leave_mentor_select_department on public.leave_requests;
drop policy if exists leave_mentor_update_department on public.leave_requests;

drop table if exists public.leave_requests cascade;
