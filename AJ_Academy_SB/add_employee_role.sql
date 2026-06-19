-- AJ Academy — allow role = 'employee' on public.profiles
-- Run in Supabase SQL Editor if User Master fails with:
--   profiles_role_check violation when creating employee users

alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'employee', 'student', 'freelancer', 'mentor'));
