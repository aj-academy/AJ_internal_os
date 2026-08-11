-- Phase 6B — ROLLBACK (emergency only)
-- Restores broad authenticated SELECT on public.profiles.
-- Re-opens the CRITICAL student-to-student (and staff) profile leak.
-- Do NOT run unless tighten breaks production and you need an emergency reopen.

begin;

drop policy if exists profiles_authenticated_read on public.profiles;
create policy profiles_authenticated_read
on public.profiles
for select
to authenticated
using (true);

commit;
