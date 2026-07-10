-- AJ Academy — restore admin / privileged data access after profiles_rls_tighten.sql
-- and student_lead_master_rls_fix.sql (which drops clients_admin_all).
-- Run in Supabase SQL Editor if dashboards / Student Master show 0 records. Safe to re-run.

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER helpers — must bypass RLS when reading profiles.role
-- ---------------------------------------------------------------------------

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
set row_security = off
as $$
  select coalesce(
    (lower(btrim(coalesce(public.get_user_role(), ''))) in ('admin', 'super_admin')),
    false
  );
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select lower(btrim(coalesce(public.get_user_role(), ''))) = 'manager';
$$;

create or replace function public.is_accounts()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select lower(btrim(coalesce(public.get_user_role(), ''))) in ('accounts', 'account');
$$;

create or replace function public.finance_is_privileged()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_admin() or public.is_accounts();
$$;

revoke all on function public.finance_is_privileged() from public;
grant execute on function public.finance_is_privileged() to authenticated;

-- Avoid infinite recursion: never subquery public.profiles from within profiles RLS policies.
create or replace function public.get_my_department()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select department from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.get_my_assigned_mentor_id()
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select assigned_mentor_id from public.profiles where id = auth.uid() limit 1;
$$;

grant execute on function public.get_my_department() to authenticated;
grant execute on function public.get_my_assigned_mentor_id() to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

drop policy if exists profiles_admin_select on public.profiles;
drop policy if exists profiles_admin_read_all on public.profiles;

create policy profiles_admin_select
on public.profiles
for select
to authenticated
using (public.is_admin());

drop policy if exists profiles_mentor_students_select on public.profiles;
create policy profiles_mentor_students_select
on public.profiles
for select
to authenticated
using (
  lower(btrim(coalesce(public.get_user_role(), ''))) = 'mentor'
  and lower(btrim(coalesce(role, ''))) = 'student'
  and (
    assigned_mentor_id = auth.uid()
    or (
      btrim(coalesce(public.get_my_department(), '')) <> ''
      and lower(btrim(coalesce(public.get_my_department(), ''))) = lower(btrim(coalesce(department, '')))
    )
  )
);

drop policy if exists profiles_student_read_mentor on public.profiles;
create policy profiles_student_read_mentor
on public.profiles
for select
to authenticated
using (
  lower(btrim(coalesce(public.get_user_role(), ''))) = 'student'
  and public.get_my_assigned_mentor_id() = id
);

-- ---------------------------------------------------------------------------
-- clients (Student Master / leads)
-- ---------------------------------------------------------------------------

drop policy if exists clients_admin_all on public.clients;
drop policy if exists "clients_admin_all" on public.clients;
drop policy if exists clients_admin_select_all on public.clients;
drop policy if exists "clients_admin_select_all" on public.clients;
drop policy if exists clients_admin_insert_all on public.clients;
drop policy if exists "clients_admin_insert_all" on public.clients;
drop policy if exists clients_admin_update_all on public.clients;
drop policy if exists "clients_admin_update_all" on public.clients;
drop policy if exists clients_admin_delete_all on public.clients;
drop policy if exists "clients_admin_delete_all" on public.clients;

create policy clients_admin_select_all
on public.clients for select to authenticated
using (public.is_admin());

create policy clients_admin_insert_all
on public.clients for insert to authenticated
with check (public.is_admin());

create policy clients_admin_update_all
on public.clients for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy clients_admin_delete_all
on public.clients for delete to authenticated
using (public.is_admin());

drop policy if exists clients_manager_select_all on public.clients;
drop policy if exists "clients_manager_select_all" on public.clients;
create policy clients_manager_select_all
on public.clients for select to authenticated
using (public.is_manager());

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

drop policy if exists "tasks_admin_select_all" on public.tasks;
create policy "tasks_admin_select_all"
on public.tasks for select to authenticated
using (public.is_admin());

drop policy if exists "tasks_admin_insert_all" on public.tasks;
create policy "tasks_admin_insert_all"
on public.tasks for insert to authenticated
with check (public.is_admin());

drop policy if exists "tasks_admin_update_all" on public.tasks;
create policy "tasks_admin_update_all"
on public.tasks for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "tasks_admin_delete_all" on public.tasks;
create policy "tasks_admin_delete_all"
on public.tasks for delete to authenticated
using (public.is_admin());

drop policy if exists "tasks_manager_select_all" on public.tasks;
create policy "tasks_manager_select_all"
on public.tasks for select to authenticated
using (public.is_manager());

drop policy if exists "tasks_manager_insert_all" on public.tasks;
create policy "tasks_manager_insert_all"
on public.tasks for insert to authenticated
with check (public.is_manager());

drop policy if exists "tasks_manager_update_all" on public.tasks;
create policy "tasks_manager_update_all"
on public.tasks for update to authenticated
using (public.is_manager())
with check (public.is_manager());

drop policy if exists "tasks_manager_delete_all" on public.tasks;
create policy "tasks_manager_delete_all"
on public.tasks for delete to authenticated
using (public.is_manager());

-- ---------------------------------------------------------------------------
-- projects + team + activities
-- ---------------------------------------------------------------------------

drop policy if exists "projects_admin_all" on public.projects;
create policy "projects_admin_all"
on public.projects for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "projects_accounts_select" on public.projects;
create policy "projects_accounts_select"
on public.projects for select to authenticated
using (public.is_accounts());

drop policy if exists "project_team_members_admin_all" on public.project_team_members;
create policy "project_team_members_admin_all"
on public.project_team_members for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "project_team_members_accounts_select" on public.project_team_members;
create policy "project_team_members_accounts_select"
on public.project_team_members for select to authenticated
using (public.is_accounts());

drop policy if exists "project_activities_admin_all" on public.project_activities;
create policy "project_activities_admin_all"
on public.project_activities for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "project_activities_accounts_select" on public.project_activities;
create policy "project_activities_accounts_select"
on public.project_activities for select to authenticated
using (public.is_accounts());

-- ---------------------------------------------------------------------------
-- attendance + permission (admin dashboard)
-- ---------------------------------------------------------------------------

drop policy if exists attendance_admin_read_all on public.attendance_records;
create policy attendance_admin_read_all
on public.attendance_records for select to authenticated
using (public.is_admin());

drop policy if exists attendance_admin_delete_all on public.attendance_records;
create policy attendance_admin_delete_all
on public.attendance_records for delete to authenticated
using (public.is_admin());

drop policy if exists work_summary_admin_read_update on public.work_summaries;
create policy work_summary_admin_read_update
on public.work_summaries for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists work_summary_admin_delete on public.work_summaries;
create policy work_summary_admin_delete
on public.work_summaries for delete to authenticated
using (public.is_admin());

drop policy if exists permission_admin_read_update on public.permission_requests;
create policy permission_admin_read_update
on public.permission_requests for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists permission_admin_delete on public.permission_requests;
create policy permission_admin_delete
on public.permission_requests for delete to authenticated
using (public.is_admin());

-- work_from_home_requests (optional table — enable RLS + admin read if present)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'work_from_home_requests'
  ) then
    execute 'alter table public.work_from_home_requests enable row level security';
    execute 'drop policy if exists wfh_employee_own on public.work_from_home_requests';
    execute $p$
      create policy wfh_employee_own on public.work_from_home_requests
      for all to authenticated
      using (employee_id = auth.uid())
      with check (employee_id = auth.uid())
    $p$;
    execute 'drop policy if exists wfh_admin_all on public.work_from_home_requests';
    execute $p$
      create policy wfh_admin_all on public.work_from_home_requests
      for all to authenticated
      using (public.is_admin())
      with check (public.is_admin())
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- finance (admin dashboard + Finance workbench)
-- ---------------------------------------------------------------------------

drop policy if exists "finance_categories_write_privileged" on public.finance_categories;
create policy "finance_categories_write_privileged"
on public.finance_categories for all to authenticated
using (public.finance_is_privileged())
with check (public.finance_is_privileged());

drop policy if exists "finance_transactions_privileged_all" on public.finance_transactions;
create policy "finance_transactions_privileged_all"
on public.finance_transactions for all to authenticated
using (public.finance_is_privileged())
with check (public.finance_is_privileged());

drop policy if exists "expense_claims_privileged_all" on public.expense_claims;
create policy "expense_claims_privileged_all"
on public.expense_claims for all to authenticated
using (public.finance_is_privileged())
with check (public.finance_is_privileged());

drop policy if exists "project_payments_privileged_all" on public.project_payments;
create policy "project_payments_privileged_all"
on public.project_payments for all to authenticated
using (public.finance_is_privileged())
with check (public.finance_is_privileged());

drop policy if exists "finance_activities_privileged_all" on public.finance_activities;
create policy "finance_activities_privileged_all"
on public.finance_activities for all to authenticated
using (public.finance_is_privileged())
with check (public.finance_is_privileged());

-- ---------------------------------------------------------------------------
-- Student Master aux tables (when student_lead_master_aux_schema.sql was run)
-- ---------------------------------------------------------------------------

drop policy if exists "lead_followups_admin_all" on public.lead_followups;
create policy "lead_followups_admin_all"
on public.lead_followups for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists lead_activities_admin_all on public.lead_activities;
drop policy if exists "lead_activities_admin_all" on public.lead_activities;
create policy lead_activities_admin_all
on public.lead_activities for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists lead_custom_columns_admin_all on public.lead_custom_columns;
drop policy if exists "lead_custom_columns_admin_all" on public.lead_custom_columns;
create policy lead_custom_columns_admin_all
on public.lead_custom_columns for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "client_documents_admin_all" on public.client_documents;
create policy "client_documents_admin_all"
on public.client_documents for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- system_settings (Settings workbench)
-- ---------------------------------------------------------------------------

drop policy if exists "system_settings_admin_select" on public.system_settings;
drop policy if exists "system_settings_admin_insert" on public.system_settings;
drop policy if exists "system_settings_admin_update" on public.system_settings;
drop policy if exists "system_settings_admin_delete" on public.system_settings;

create policy "system_settings_admin_select"
on public.system_settings for select to authenticated
using (public.is_admin());

create policy "system_settings_admin_insert"
on public.system_settings for insert to authenticated
with check (public.is_admin());

create policy "system_settings_admin_update"
on public.system_settings for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "system_settings_admin_delete"
on public.system_settings for delete to authenticated
using (public.is_admin());

-- ---------------------------------------------------------------------------
-- leave_requests (employee dashboard)
-- ---------------------------------------------------------------------------

drop policy if exists leave_admin_all on public.leave_requests;
create policy leave_admin_all
on public.leave_requests for all to authenticated
using (public.is_admin())
with check (public.is_admin());

comment on function public.is_admin() is 'SECURITY DEFINER admin check — bypasses profiles RLS for policy evaluation.';
comment on function public.finance_is_privileged() is 'Admin or accounts role — bypasses profiles RLS for finance policies.';
