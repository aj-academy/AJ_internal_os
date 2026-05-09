-- Optional: align profiles.status with Employee Master / Login (active | inactive).

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (
    lower(coalesce(status, 'active')) in ('active', 'inactive')
  );
