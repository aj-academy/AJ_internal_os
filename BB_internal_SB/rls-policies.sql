alter table if exists public.profiles enable row level security;
alter table if exists public.employee_details enable row level security;
alter table if exists public.audit_logs enable row level security;
alter table if exists public.system_settings enable row level security;

-- =========================
-- PROFILES
-- =========================
drop policy if exists "profiles_admin_full_access" on public.profiles;
create policy "profiles_admin_full_access"
on public.profiles
for all
to authenticated
using (public.get_user_role() in ('admin', 'super_admin'))
with check (public.get_user_role() in ('admin', 'super_admin'));

drop policy if exists "profiles_manager_team_read" on public.profiles;
create policy "profiles_manager_team_read"
on public.profiles
for select
to authenticated
using (
  public.get_user_role() = 'manager'
  and (
    id = auth.uid()
    or (
      role = 'employee'
      and department = (
        select p.department
        from public.profiles p
        where p.id = auth.uid()
      )
    )
  )
);

drop policy if exists "profiles_employee_own_read" on public.profiles;
create policy "profiles_employee_own_read"
on public.profiles
for select
to authenticated
using (
  public.get_user_role() = 'employee'
  and id = auth.uid()
);

drop policy if exists "profiles_accounts_limited_read" on public.profiles;
create policy "profiles_accounts_limited_read"
on public.profiles
for select
to authenticated
using (
  public.get_user_role() = 'accounts'
  and role in ('employee', 'manager')
);

drop policy if exists "profiles_own_update" on public.profiles;
create policy "profiles_own_update"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- =========================
-- EMPLOYEE_DETAILS
-- =========================
drop policy if exists "employee_details_admin_full_access" on public.employee_details;
create policy "employee_details_admin_full_access"
on public.employee_details
for all
to authenticated
using (public.get_user_role() in ('admin', 'super_admin'))
with check (public.get_user_role() in ('admin', 'super_admin'));

drop policy if exists "employee_details_manager_assigned_read" on public.employee_details;
create policy "employee_details_manager_assigned_read"
on public.employee_details
for select
to authenticated
using (
  public.get_user_role() = 'manager'
  and manager_id = auth.uid()
);

drop policy if exists "employee_details_employee_own_read" on public.employee_details;
create policy "employee_details_employee_own_read"
on public.employee_details
for select
to authenticated
using (
  public.get_user_role() = 'employee'
  and profile_id = auth.uid()
);

drop policy if exists "employee_details_employee_own_update" on public.employee_details;
create policy "employee_details_employee_own_update"
on public.employee_details
for update
to authenticated
using (
  public.get_user_role() = 'employee'
  and profile_id = auth.uid()
)
with check (
  public.get_user_role() = 'employee'
  and profile_id = auth.uid()
  and manager_id = (select ed.manager_id from public.employee_details ed where ed.profile_id = auth.uid())
);

-- =========================
-- AUDIT_LOGS
-- =========================
drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read"
on public.audit_logs
for select
to authenticated
using (public.get_user_role() in ('admin', 'super_admin'));

-- =========================
-- SYSTEM_SETTINGS
-- =========================
drop policy if exists "system_settings_admin_read" on public.system_settings;
create policy "system_settings_admin_read"
on public.system_settings
for select
to authenticated
using (public.get_user_role() in ('admin', 'super_admin'));

drop policy if exists "system_settings_admin_update" on public.system_settings;
create policy "system_settings_admin_update"
on public.system_settings
for update
to authenticated
using (public.get_user_role() in ('admin', 'super_admin'))
with check (public.get_user_role() in ('admin', 'super_admin'));

drop policy if exists "system_settings_admin_insert" on public.system_settings;
create policy "system_settings_admin_insert"
on public.system_settings
for insert
to authenticated
with check (public.get_user_role() in ('admin', 'super_admin'));
