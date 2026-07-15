-- Task-linked Student Master access for assignees/assigners
-- Allows phone/WA/email + light CRM updates on leads attached to THEIR tasks only.
-- Does NOT restore blanket employee CRM access.
-- Run after employee_student_master_rls.sql + tasks_assignment_link_patch.sql + tasks_employee_rls_fix.sql.
-- Safe to re-run.

create or replace function public.task_links_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.tasks t
    where coalesce(t.assignment_type, '') = 'lead'
      and (
        t.assigned_to = auth.uid()
        or t.assigned_by = auth.uid()
      )
      and t.client_ids @> jsonb_build_array(p_client_id::text)
  );
$$;

grant execute on function public.task_links_client(uuid) to authenticated;

comment on function public.task_links_client(uuid) is
  'True when the current user is assignee or assigner of a lead-linked task that includes this client id.';

-- SELECT linked lead contact fields for task work (alongside assigned-only Student Master policy)
drop policy if exists clients_employee_select_task_linked on public.clients;
create policy clients_employee_select_task_linked
on public.clients for select to authenticated
using (
  public.is_employee()
  and public.task_links_client(id)
);

-- UPDATE contact flags / last_contacted only on task-linked leads (not full CRM edit)
drop policy if exists clients_employee_update_task_linked_contact on public.clients;
create policy clients_employee_update_task_linked_contact
on public.clients for update to authenticated
using (
  public.is_employee()
  and public.task_links_client(id)
)
with check (
  public.is_employee()
  and public.task_links_client(id)
);

-- lead_activities — allow inserts/select for task-linked outreach
drop policy if exists lead_activities_employee_insert_task_linked on public.lead_activities;
create policy lead_activities_employee_insert_task_linked
on public.lead_activities for insert to authenticated
with check (
  public.is_employee()
  and public.task_links_client(client_id)
);

drop policy if exists lead_activities_employee_select_task_linked on public.lead_activities;
create policy lead_activities_employee_select_task_linked
on public.lead_activities for select to authenticated
using (
  public.is_employee()
  and public.task_links_client(client_id)
);

-- Optional: pin tasks to employee dashboard (handover follow-down)
create table if not exists public.employee_task_pins (
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  pinned_at timestamptz not null default now(),
  pin_section text,
  primary key (user_id, task_id)
);

-- Older DBs created without pin_section
alter table public.employee_task_pins
  add column if not exists pin_section text;

create index if not exists employee_task_pins_user_idx on public.employee_task_pins (user_id, pinned_at desc);

alter table public.employee_task_pins enable row level security;

drop policy if exists employee_task_pins_own_all on public.employee_task_pins;
create policy employee_task_pins_own_all
on public.employee_task_pins for all to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.tasks t
    where t.id = task_id
      and (t.assigned_to = auth.uid() or t.assigned_by = auth.uid() or public.is_admin())
  )
);

-- UPDATE required for upsert (re-pin / change section) and pinned_at refresh
grant select, insert, update, delete on public.employee_task_pins to authenticated;
