-- Fix CRM deletes blocked by RLS cascade (children deny DELETE → parent silent fail / error).
-- Also adds employee own-row delete + verification RPCs.
-- Run after crm_owner_isolation.sql. Safe to re-run.

-- ---------- Own-row delete for employees (missing previously) ----------
drop policy if exists clients_employee_delete_assigned on public.clients;
create policy clients_employee_delete_assigned
on public.clients for delete to authenticated
using (public.is_employee() and assigned_to = auth.uid());

-- ---------- Child tables must allow DELETE when cascading from an owned parent ----------
drop policy if exists lead_followups_employee_delete on public.lead_followups;
create policy lead_followups_employee_delete
on public.lead_followups for delete to authenticated
using (
  public.is_employee()
  and exists (
    select 1 from public.clients c
    where c.id = client_id and c.assigned_to = auth.uid()
  )
);

drop policy if exists lead_activities_employee_delete on public.lead_activities;
create policy lead_activities_employee_delete
on public.lead_activities for delete to authenticated
using (
  (
    public.is_employee()
    and exists (
      select 1 from public.clients c
      where c.id = client_id and c.assigned_to = auth.uid()
    )
  )
  or public.task_links_client(client_id)
);

drop policy if exists client_documents_employee_delete on public.client_documents;
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'client_documents'
  ) then
    execute $p$
      drop policy if exists client_documents_employee_delete on public.client_documents;
      create policy client_documents_employee_delete
      on public.client_documents for delete to authenticated
      using (
        public.is_employee()
        and exists (
          select 1 from public.clients c
          where c.id = client_id and c.assigned_to = auth.uid()
        )
      )
    $p$;
  end if;
end $$;

-- ---------- Reliable owned deletes (bypass child RLS during cascade) ----------
create or replace function public.delete_owned_clients(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  n integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.clients
  where id = any(p_ids)
    and (assigned_to = auth.uid() or public.is_admin());

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.delete_owned_clients(uuid[]) to authenticated;

create or replace function public.delete_owned_college_visits(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  n integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.college_visits
  where id = any(p_ids)
    and (
      public.is_admin()
      or assigned_to = auth.uid()
      or created_by = auth.uid()
    );

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.delete_owned_college_visits(uuid[]) to authenticated;

comment on function public.delete_owned_clients(uuid[]) is
  'Deletes Student Master rows owned by the caller, or any rows when caller is admin. Bypasses child RLS so cascades succeed.';
comment on function public.delete_owned_college_visits(uuid[]) is
  'Deletes College Visit rows owned by the caller, or any rows when caller is admin. Bypasses child activity RLS so cascades succeed.';
