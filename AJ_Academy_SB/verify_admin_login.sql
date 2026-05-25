-- Run in Supabase SQL Editor to verify admin123@gmail.com can log in
-- Profile id MUST equal auth.users.id

select
  p.id as profile_id,
  p.email as profile_email,
  p.role,
  p.status,
  u.id as auth_user_id,
  u.email as auth_email,
  u.last_sign_in_at,
  case
    when u.id is null then 'MISSING: create user in Authentication with this UUID'
    when p.id <> u.id then 'MISMATCH: profile.id must match auth.users.id'
    when lower(p.email) <> lower(u.email) then 'EMAIL MISMATCH between profile and auth'
    else 'OK'
  end as check_result
from public.profiles p
left join auth.users u on u.id = p.id
where lower(p.email) = 'admin123@gmail.com';
