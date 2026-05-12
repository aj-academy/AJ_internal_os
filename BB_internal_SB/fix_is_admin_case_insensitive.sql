-- Run in Supabase SQL Editor if logins fail with "role not assigned" after RLS changes.
-- Makes is_admin() tolerate whitespace / casing on profiles.role (must still be a valid role).

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (lower(btrim(coalesce(public.get_user_role(), ''))) in ('admin', 'super_admin')),
    false
  );
$$;
