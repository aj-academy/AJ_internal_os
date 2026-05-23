-- AJ Academy — run in Supabase SQL Editor if login redirects back to /login
-- Ensures every logged-in user can read their own profile row.
-- Also adds get_my_profile() so server auth works even when legacy RLS blocks direct selects.

create or replace function public.get_my_profile()
returns table (
  id uuid,
  full_name text,
  email text,
  role text,
  department text,
  designation text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    p.id,
    p.full_name,
    p.email,
    p.role,
    p.department,
    p.designation,
    p.status,
    p.created_at
  from public.profiles p
  where p.id = auth.uid()
     or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt()->>'email', ''))
  order by case when p.id = auth.uid() then 0 else 1 end, p.created_at nulls last
  limit 1;
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

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
