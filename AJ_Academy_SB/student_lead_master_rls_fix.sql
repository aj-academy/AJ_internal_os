-- Student Lead Master — RLS hardening for public.clients
-- Run after student_lead_master_schema.sql (+ employee_lead_management_schema.sql if used).
-- Table name remains public.clients (FKs from projects / finance). Safe to re-run.

-- Drop overlapping legacy FOR ALL admin policy from project_master stub if present
drop policy if exists clients_admin_all on public.clients;

-- Re-apply granular admin policies (student_lead_master_rls_fix used to drop admin access only)
drop policy if exists clients_admin_select_all on public.clients;
drop policy if exists clients_admin_insert_all on public.clients;
drop policy if exists clients_admin_update_all on public.clients;
drop policy if exists clients_admin_delete_all on public.clients;

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

-- Ensure employees can only update rows assigned to them, and cannot reassign ownership
drop policy if exists clients_employee_update_assigned on public.clients;
drop policy if exists clients_employee_update_assigned_self on public.clients;

create policy clients_employee_update_assigned on public.clients
for update to authenticated
using (assigned_to = auth.uid())
with check (assigned_to = auth.uid());

-- Employees may insert only when assigning to themselves (counsellor self-capture)
drop policy if exists clients_employee_insert_assigned_self on public.clients;
create policy clients_employee_insert_assigned_self on public.clients
for insert to authenticated
with check (
  assigned_to = auth.uid()
  and (assigned_by is null or assigned_by = auth.uid())
);

comment on table public.clients is 'Student Lead Master store (legacy table name clients; UI: Student Master)';
