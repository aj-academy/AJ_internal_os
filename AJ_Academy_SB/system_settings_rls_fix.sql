-- Fix: admin cannot upsert system_settings (RLS blocks when profiles subquery runs as user).
-- Run after system_settings_schema.sql and profiles_rls_fix.sql.

-- Seed hr_org so department saves are UPDATE not INSERT-only
insert into public.system_settings (setting_key, setting_value)
values ('hr_org', '{"departments":["Engineering","Digital Marketing","Human Resources","Finance","Operations","Sales"]}'::jsonb)
on conflict (setting_key) do nothing;

drop policy if exists "system_settings_admin_all" on public.system_settings;
drop policy if exists "system_settings_admin_read" on public.system_settings;
drop policy if exists "system_settings_admin_select" on public.system_settings;
drop policy if exists "system_settings_admin_insert" on public.system_settings;
drop policy if exists "system_settings_admin_update" on public.system_settings;
drop policy if exists "system_settings_admin_delete" on public.system_settings;

create policy "system_settings_admin_select"
on public.system_settings
for select
to authenticated
using (public.is_admin());

create policy "system_settings_admin_insert"
on public.system_settings
for insert
to authenticated
with check (public.is_admin());

create policy "system_settings_admin_update"
on public.system_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "system_settings_admin_delete"
on public.system_settings
for delete
to authenticated
using (public.is_admin());
