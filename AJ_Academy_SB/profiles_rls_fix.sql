-- AJ Academy — run in Supabase SQL Editor if login redirects back to /login
-- Ensures every logged-in user can read their own profile row.

grant select on table public.profiles to authenticated;

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

drop policy if exists profiles_admin_read_all on public.profiles;
create policy profiles_admin_read_all
on public.profiles
for select
to authenticated
using (public.is_admin());
