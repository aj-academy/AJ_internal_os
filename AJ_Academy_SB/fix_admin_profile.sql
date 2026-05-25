-- AJ Academy — run in Supabase SQL Editor (same project as .env.local)
-- Step 1: Run profiles_rls_fix.sql FIRST (entire file), then run this file.

-- Step 2: See your Auth users and whether a profile exists
select
  u.id as auth_user_id,
  u.email as auth_email,
  p.id as profile_id,
  p.role,
  p.status,
  case
    when p.id is null then 'NO PROFILE — run Step 3 insert below'
    when p.id <> u.id then 'WRONG PROFILE ID — run Step 3 with auth_user_id'
    else 'OK'
  end as fix_hint
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc;

-- Step 3: Fix admin123@gmail.com
-- MUST match Authentication → Users → User UID (your app showed this id):
insert into public.profiles (id, full_name, email, role, department, designation, status)
values (
  'c9478e49-59b2-43c4-bd81-ad51763797ab',
  'Admin',
  'admin123@gmail.com',
  'admin',
  'Operations',
  'Administrator',
  'active'
)
on conflict (id) do update set
  email = excluded.email,
  role = excluded.role,
  status = excluded.status,
  full_name = excluded.full_name;

-- Step 4: adminuser@gmail.com (get UID from Authentication → Users → click user)
-- insert into public.profiles (id, full_name, email, role, status)
-- values ('PASTE-ADMINUSER-UUID', 'Admin User', 'adminuser@gmail.com', 'admin', 'active')
-- on conflict (id) do update set role = excluded.role, status = excluded.status, email = excluded.email;

-- Or run add_role_and_sync_profiles.sql once — creates profiles + role for ALL Auth users.

-- Step 5: Confirm — role column visible here
select id, email, role, status from public.profiles order by created_at desc;
