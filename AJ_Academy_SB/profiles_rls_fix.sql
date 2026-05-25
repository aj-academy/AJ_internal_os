-- AJ Academy / AJ_internal_OS — run in Supabase SQL Editor (required for login)
-- Safe RLS: no recursive policies; authenticated users can read profiles.

-- Required when the function previously returned extra columns (department, status, etc.)
drop function if exists public.get_my_profile();

create function public.get_my_profile()
returns table (
  id uuid,
  full_name text,
  email text,
  role text
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
    p.role
  from public.profiles p
  where p.id = auth.uid()
     or lower(coalesce(p.email, '')) = lower(coalesce(auth.jwt()->>'email', ''))
  order by case when p.id = auth.uid() then 0 else 1 end
  limit 1;
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

grant select on table public.profiles to authenticated;

drop policy if exists profiles_authenticated_read on public.profiles;
create policy profiles_authenticated_read
on public.profiles
for select
to authenticated
using (true);

-- Legacy narrow policies (optional; broad policy above covers login)
drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_self_read_by_email on public.profiles;
drop policy if exists profiles_admin_read_all on public.profiles;
