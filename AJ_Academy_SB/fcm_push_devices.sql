-- Firebase Cloud Messaging device registry for AJ OS
-- Run after schema.sql (profiles). Safe to re-run.
-- Does NOT replace in_app_notifications or aj_reminder_push_subscriptions.

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  fcm_token text not null,
  device_name text,
  platform text,
  browser text,
  user_agent text,
  is_active boolean not null default true,
  permission_status text not null default 'granted',
  notifications_after_logout boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  disabled_reason text,
  constraint push_devices_fcm_token_unique unique (fcm_token)
);

create index if not exists push_devices_user_id_idx on public.push_devices (user_id);
create index if not exists push_devices_active_idx on public.push_devices (is_active) where is_active = true;
create index if not exists push_devices_last_seen_idx on public.push_devices (last_seen_at desc);
create index if not exists push_devices_user_active_idx
  on public.push_devices (user_id, is_active)
  where is_active = true;

create or replace function public.push_devices_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_devices_updated_at on public.push_devices;
create trigger push_devices_updated_at
before update on public.push_devices
for each row execute function public.push_devices_set_updated_at();

-- Optional delivery tracking on existing in-app notifications (source of truth stays in_app_notifications)
alter table public.in_app_notifications
  add column if not exists push_status text not null default 'pending';
alter table public.in_app_notifications
  add column if not exists push_sent_at timestamptz;
alter table public.in_app_notifications
  add column if not exists push_success_count integer not null default 0;
alter table public.in_app_notifications
  add column if not exists push_failure_count integer not null default 0;
alter table public.in_app_notifications
  add column if not exists last_push_error text;

create index if not exists in_app_notifications_type_created_idx
  on public.in_app_notifications (type, created_at desc);

-- ---------- RLS ----------
alter table public.push_devices enable row level security;

drop policy if exists push_devices_select_own on public.push_devices;
create policy push_devices_select_own
on public.push_devices for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists push_devices_insert_own on public.push_devices;
create policy push_devices_insert_own
on public.push_devices for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists push_devices_update_own on public.push_devices;
create policy push_devices_update_own
on public.push_devices for update to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

-- Employees must not delete arbitrarily; deactivate via update. Admins may delete.
drop policy if exists push_devices_delete_admin on public.push_devices;
create policy push_devices_delete_admin
on public.push_devices for delete to authenticated
using (public.is_admin());

grant select, insert, update, delete on public.push_devices to authenticated;

comment on table public.push_devices is
  'FCM device tokens. Remain active after normal logout when notifications_after_logout is true.';
