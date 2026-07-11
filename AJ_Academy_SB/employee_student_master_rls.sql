-- Employee Student Master — same CRM access as admin on clients + aux tables
-- Run after student_lead_master_schema.sql, student_lead_master_aux_schema.sql, security_rls_access_fix.sql
-- Safe to re-run.

create or replace function public.is_employee()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select lower(btrim(coalesce(public.get_user_role(), ''))) = 'employee';
$$;

grant execute on function public.is_employee() to authenticated;

-- clients — drop legacy assigned-only policies (they block create/select when assigned_to is unset)
drop policy if exists "clients_employee_select_assigned" on public.clients;
drop policy if exists clients_employee_select_assigned on public.clients;
drop policy if exists "clients_employee_update_assigned" on public.clients;
drop policy if exists clients_employee_update_assigned on public.clients;
drop policy if exists "clients_employee_insert_assigned_self" on public.clients;
drop policy if exists clients_employee_insert_assigned_self on public.clients;
drop policy if exists clients_employee_update_assigned_self on public.clients;

-- clients — full CRM for employees (Student Master)
drop policy if exists clients_employee_crm_all on public.clients;
create policy clients_employee_crm_all
on public.clients for all to authenticated
using (public.is_employee())
with check (public.is_employee());

-- lead_followups — drop legacy assigned-only policies
drop policy if exists "lead_followups_employee_select" on public.lead_followups;
drop policy if exists lead_followups_employee_select on public.lead_followups;
drop policy if exists "lead_followups_employee_insert" on public.lead_followups;
drop policy if exists lead_followups_employee_insert on public.lead_followups;
drop policy if exists "lead_followups_employee_update" on public.lead_followups;
drop policy if exists lead_followups_employee_update on public.lead_followups;

drop policy if exists lead_followups_employee_crm_all on public.lead_followups;
create policy lead_followups_employee_crm_all
on public.lead_followups for all to authenticated
using (public.is_employee())
with check (public.is_employee());

-- lead_activities — drop legacy assigned-only policies
drop policy if exists "lead_activities_employee_select" on public.lead_activities;
drop policy if exists lead_activities_employee_select on public.lead_activities;
drop policy if exists "lead_activities_employee_insert" on public.lead_activities;
drop policy if exists lead_activities_employee_insert on public.lead_activities;

drop policy if exists lead_activities_employee_crm_all on public.lead_activities;
create policy lead_activities_employee_crm_all
on public.lead_activities for all to authenticated
using (public.is_employee())
with check (public.is_employee());

-- client_documents (if table exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'client_documents'
  ) then
    execute 'drop policy if exists client_documents_employee_crm_all on public.client_documents';
    execute $p$
      create policy client_documents_employee_crm_all
      on public.client_documents for all to authenticated
      using (public.is_employee())
      with check (public.is_employee())
    $p$;
  end if;
end $$;

-- system_settings read for CRM templates (employees)
drop policy if exists system_settings_employee_select on public.system_settings;
create policy system_settings_employee_select
on public.system_settings for select to authenticated
using (public.is_employee());

-- profiles — assignee lists + owner names in Student Master
drop policy if exists profiles_employee_crm_select on public.profiles;
create policy profiles_employee_crm_select
on public.profiles for select to authenticated
using (public.is_employee());

comment on function public.is_employee() is 'Employee role check for Student Master CRM RLS.';
