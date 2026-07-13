-- Employee Student Master — assigned leads only (not all CRM rows)
-- Replaces the previous blanket clients_employee_crm_all policy.
-- Run after student_lead_master_schema.sql, student_lead_master_aux_schema.sql,
-- student_lead_master_rls_fix.sql, and (if already applied) the old employee_student_master_rls.sql.
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

-- Drop blanket employee CRM policies (from earlier full-access patch)
drop policy if exists clients_employee_crm_all on public.clients;
drop policy if exists lead_followups_employee_crm_all on public.lead_followups;
drop policy if exists lead_activities_employee_crm_all on public.lead_activities;
drop policy if exists client_documents_employee_crm_all on public.client_documents;

-- clients — assigned rows only + self-insert
drop policy if exists "clients_employee_select_assigned" on public.clients;
drop policy if exists clients_employee_select_assigned on public.clients;
create policy clients_employee_select_assigned
on public.clients for select to authenticated
using (public.is_employee() and assigned_to = auth.uid());

drop policy if exists "clients_employee_update_assigned" on public.clients;
drop policy if exists clients_employee_update_assigned on public.clients;
create policy clients_employee_update_assigned
on public.clients for update to authenticated
using (public.is_employee() and assigned_to = auth.uid())
with check (public.is_employee() and assigned_to = auth.uid());

drop policy if exists "clients_employee_insert_assigned_self" on public.clients;
drop policy if exists clients_employee_insert_assigned_self on public.clients;
create policy clients_employee_insert_assigned_self
on public.clients for insert to authenticated
with check (
  public.is_employee()
  and assigned_to = auth.uid()
  and (assigned_by is null or assigned_by = auth.uid())
);

-- lead_followups — only for assigned clients
drop policy if exists "lead_followups_employee_select" on public.lead_followups;
drop policy if exists lead_followups_employee_select on public.lead_followups;
create policy lead_followups_employee_select
on public.lead_followups for select to authenticated
using (
  public.is_employee()
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.assigned_to = auth.uid()
  )
);

drop policy if exists "lead_followups_employee_insert" on public.lead_followups;
drop policy if exists lead_followups_employee_insert on public.lead_followups;
create policy lead_followups_employee_insert
on public.lead_followups for insert to authenticated
with check (
  public.is_employee()
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.assigned_to = auth.uid()
  )
);

drop policy if exists "lead_followups_employee_update" on public.lead_followups;
drop policy if exists lead_followups_employee_update on public.lead_followups;
create policy lead_followups_employee_update
on public.lead_followups for update to authenticated
using (
  public.is_employee()
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.assigned_to = auth.uid()
  )
)
with check (
  public.is_employee()
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.assigned_to = auth.uid()
  )
);

-- lead_activities — only for assigned clients
drop policy if exists "lead_activities_employee_select" on public.lead_activities;
drop policy if exists lead_activities_employee_select on public.lead_activities;
create policy lead_activities_employee_select
on public.lead_activities for select to authenticated
using (
  public.is_employee()
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.assigned_to = auth.uid()
  )
);

drop policy if exists "lead_activities_employee_insert" on public.lead_activities;
drop policy if exists lead_activities_employee_insert on public.lead_activities;
create policy lead_activities_employee_insert
on public.lead_activities for insert to authenticated
with check (
  public.is_employee()
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.assigned_to = auth.uid()
  )
);

-- client_documents (if present) — assigned clients only
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'client_documents'
  ) then
    execute 'drop policy if exists client_documents_employee_crm_all on public.client_documents';
    execute 'drop policy if exists client_documents_employee_assigned_rw on public.client_documents';
    execute 'drop policy if exists "client_documents_employee_assigned_rw" on public.client_documents';
    execute 'drop policy if exists client_documents_employee_assigned_select on public.client_documents';
    execute 'drop policy if exists "client_documents_employee_assigned_select" on public.client_documents';
    execute $p$
      create policy client_documents_employee_assigned_select
      on public.client_documents for select to authenticated
      using (
        public.is_employee()
        and exists (
          select 1 from public.clients c
          where c.id = client_id and c.assigned_to = auth.uid()
        )
      )
    $p$;
    execute $p$
      create policy client_documents_employee_assigned_rw
      on public.client_documents for insert to authenticated
      with check (
        public.is_employee()
        and exists (
          select 1 from public.clients c
          where c.id = client_id and c.assigned_to = auth.uid()
        )
      )
    $p$;
  end if;
end $$;

-- Keep read access for templates + assignee name lists
drop policy if exists system_settings_employee_select on public.system_settings;
create policy system_settings_employee_select
on public.system_settings for select to authenticated
using (public.is_employee());

drop policy if exists profiles_employee_crm_select on public.profiles;
create policy profiles_employee_crm_select
on public.profiles for select to authenticated
using (public.is_employee());

comment on function public.is_employee() is 'Employee role check — Student Master RLS scopes clients to assigned_to = auth.uid().';
