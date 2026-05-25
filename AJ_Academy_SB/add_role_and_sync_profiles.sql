-- AJ Academy — run in Supabase SQL Editor (project urgqnaxzeffgwfnlbixv)
-- 1) Ensures public.profiles has a role column
-- 2) Creates a profile row for every Auth user that is missing one
-- 3) Sets role = admin for known admin emails (edit the list if needed)
-- 4) Copies role into Auth user metadata (visible when you open a user in Authentication)

-- ── Ensure role column exists on profiles ──
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists status text default 'active';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'student', 'freelancer', 'mentor'));

-- ── Create missing profile rows (role column filled) ──
insert into public.profiles (id, full_name, email, role, status)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', initcap(replace(split_part(u.email, '@', 1), '.', ' '))),
  lower(u.email),
  case
    when lower(u.email) in ('admin123@gmail.com', 'adminuser@gmail.com') then 'admin'
    when lower(coalesce(u.raw_user_meta_data->>'role', '')) in (
      'super_admin', 'admin', 'student', 'freelancer', 'mentor'
    ) then lower(u.raw_user_meta_data->>'role')
    else 'student'
  end,
  'active'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and u.email is not null;

-- ── Fix admin emails that already have a profile but wrong role ──
update public.profiles
set role = 'admin', status = 'active'
where lower(email) in ('admin123@gmail.com', 'adminuser@gmail.com');

-- ── Show role in Auth user metadata (optional; open user in Authentication → Raw data) ──
update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', p.role, 'app', 'aj_academy')
from public.profiles p
where p.id = u.id;

-- ── Verify: every Auth user should have a profile with role ──
select
  u.id as auth_user_id,
  u.email as auth_email,
  p.role,
  p.status,
  u.raw_user_meta_data->>'role' as role_in_auth_metadata,
  case when p.id is null then 'MISSING PROFILE' else 'OK' end as check_result
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc;
