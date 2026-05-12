-- Run in Supabase SQL Editor BEFORE attendance_rls.sql when you get:
--   ERROR: function public.is_admin() does not exist
--
-- These helpers are normally created by schema.sql (step 1 in DATABASE_SETUP_ORDER.txt).
-- Use this file if you only need the minimum for attendance_rls.sql policies.

create or replace function public.get_user_role()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

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
