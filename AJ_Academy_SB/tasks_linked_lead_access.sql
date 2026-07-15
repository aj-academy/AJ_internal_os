-- Task-linked Student Master access for assignees/assigners
-- Allows phone/WA/email + light CRM updates on leads attached to THEIR tasks only.
-- Does NOT restore blanket employee CRM access.
-- Run after employee_student_master_rls.sql + tasks_assignment_link_patch.sql + tasks_employee_rls_fix.sql.
-- Safe to re-run.

-- Helper: does tasks.client_ids JSON array contain this UUID (string or json scalar)?
create or replace function public.task_client_ids_contain(p_client_ids jsonb, p_client_id uuid)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_client_ids, '[]'::jsonb)) as e(val)
    where lower(btrim(e.val::text, '"')) = lower(p_client_id::text)
       or lower(coalesce(e.val #>> '{}', '')) = lower(p_client_id::text)
  );
$$;

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
    where (t.assigned_to = auth.uid() or t.assigned_by = auth.uid())
      and public.task_client_ids_contain(t.client_ids, p_client_id)
  );
$$;

grant execute on function public.task_client_ids_contain(jsonb, uuid) to authenticated;
grant execute on function public.task_links_client(uuid) to authenticated;

comment on function public.task_links_client(uuid) is
  'True when the current user is assignee or assigner of a task whose client_ids includes this client id.';

-- SECURITY DEFINER loader — uses invoker uid once; does not nest auth.uid() through another definer call only
create or replace function public.get_my_task_linked_clients(p_ids uuid[])
returns setof public.clients
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;

  return query
  select c.*
  from public.clients c
  where c.id = any (p_ids)
    and exists (
      select 1
      from public.tasks t
      where (t.assigned_to = uid or t.assigned_by = uid)
        and public.task_client_ids_contain(t.client_ids, c.id)
    );
end;
$$;

grant execute on function public.get_my_task_linked_clients(uuid[]) to authenticated;

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

alter table public.employee_task_pins
  add column if not exists pin_section text;

create index if not exists employee_task_pins_user_idx on public.employee_task_pins (user_id, pinned_at desc);

alter table public.employee_task_pins enable row level security;

-- Bypass nested tasks RLS when checking pin eligibility
create or replace function public.can_pin_employee_task(p_task_id uuid)
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
    where t.id = p_task_id
      and (
        t.assigned_to = auth.uid()
        or t.assigned_by = auth.uid()
        or public.is_admin()
      )
  );
$$;

grant execute on function public.can_pin_employee_task(uuid) to authenticated;

drop policy if exists employee_task_pins_own_all on public.employee_task_pins;
create policy employee_task_pins_own_all
on public.employee_task_pins for all to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and public.can_pin_employee_task(task_id)
);

grant select, insert, update, delete on public.employee_task_pins to authenticated;

create or replace function public.upsert_my_task_pins(
  p_task_ids uuid[],
  p_pin_section text default 'all'
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_section text := nullif(btrim(coalesce(p_pin_section, '')), '');
  v_id uuid;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_section is null
     or v_section not in ('lead', 'college', 'project', 'all') then
    v_section := 'all';
  end if;

  if p_task_ids is null or cardinality(p_task_ids) = 0 then
    return 0;
  end if;

  foreach v_id in array p_task_ids
  loop
    if v_id is null then
      continue;
    end if;
    if not public.can_pin_employee_task(v_id) then
      continue;
    end if;

    insert into public.employee_task_pins as p (user_id, task_id, pin_section, pinned_at)
    values (v_uid, v_id, v_section, now())
    on conflict (user_id, task_id) do update
      set pin_section = excluded.pin_section,
          pinned_at = excluded.pinned_at;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.upsert_my_task_pins(uuid[], text) to authenticated;
