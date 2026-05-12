-- Run in Supabase SQL Editor if you see:
--   "infinite recursion detected in policy for relation profiles"
-- or HTTP 500 on GET /rest/v1/profiles.
--
-- Policies on profiles call get_user_role(), which queried profiles under RLS again.
-- SET row_security = off limits the inner SELECT to bypass RLS only inside this
-- SECURITY DEFINER function (still constrained to auth.uid()).

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
