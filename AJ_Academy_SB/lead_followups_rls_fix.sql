-- Fix Student Master follow-up save (admin + employee RLS on lead_followups / lead_activities).
-- Safe to re-run.
-- Why this is needed:
--   employee_student_master_rls.sql only grants role = employee.
--   Admins need is_admin() policies (often from security_rls_access_fix.sql).
--   If those were never applied (or dropped), Follow-up save fails with RLS / Forbidden.

-- Ensure helpers exist and bypass RLS when reading profiles.role
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

grant execute on function public.get_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_employee() to authenticated;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'lead_followups'
  ) then
    raise exception 'public.lead_followups is missing. Run student_lead_master_aux_schema.sql first.';
  end if;
end $$;

alter table public.lead_followups enable row level security;
alter table public.lead_activities enable row level security;

-- ---------------------------------------------------------------------------
-- Admin / super_admin — full access
-- ---------------------------------------------------------------------------
drop policy if exists "lead_followups_admin_all" on public.lead_followups;
drop policy if exists lead_followups_admin_all on public.lead_followups;
create policy lead_followups_admin_all
on public.lead_followups for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "lead_activities_admin_all" on public.lead_activities;
drop policy if exists lead_activities_admin_all on public.lead_activities;
create policy lead_activities_admin_all
on public.lead_activities for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Employee — assigned leads only
-- ---------------------------------------------------------------------------
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

-- Ensure clients admin write still exists (follow-up also updates clients.follow_up_*)
drop policy if exists clients_admin_update_all on public.clients;
create policy clients_admin_update_all
on public.clients for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists clients_admin_select_all on public.clients;
create policy clients_admin_select_all
on public.clients for select to authenticated
using (public.is_admin());
