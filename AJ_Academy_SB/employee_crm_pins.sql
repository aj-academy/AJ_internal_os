-- Employee CRM pins: My Tasks "Pin selected" lands linked leads/colleges
-- into Student Master / College Visits for that employee (not the dashboard task preview).
-- Run after tasks_linked_lead_access.sql. Safe to re-run.

create table if not exists public.employee_crm_pins (
  user_id uuid not null references public.profiles (id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'college')),
  entity_id uuid not null,
  source_task_id uuid null references public.tasks (id) on delete set null,
  pinned_at timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

create index if not exists employee_crm_pins_user_type_idx
  on public.employee_crm_pins (user_id, entity_type, pinned_at desc);

alter table public.employee_crm_pins enable row level security;

drop policy if exists employee_crm_pins_own_all on public.employee_crm_pins;
create policy employee_crm_pins_own_all
on public.employee_crm_pins for all to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and (
    (entity_type = 'lead' and public.task_links_client(entity_id))
    or (entity_type = 'college' and public.task_links_college(entity_id))
    or public.is_admin()
  )
);

grant select, insert, update, delete on public.employee_crm_pins to authenticated;

-- List pin ids for current user (used by Student Master / College Visits loaders)
create or replace function public.get_my_crm_pin_ids(p_entity_type text)
returns uuid[]
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(array_agg(p.entity_id), '{}'::uuid[])
  from public.employee_crm_pins p
  where p.user_id = auth.uid()
    and p.entity_type = p_entity_type;
$$;

grant execute on function public.get_my_crm_pin_ids(text) to authenticated;

-- Atomic pin from My Tasks (lead / college task rows)
create or replace function public.upsert_my_crm_pins_from_tasks(
  p_task_ids uuid[],
  p_entity_type text
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_task uuid;
  v_entity uuid;
  v_count integer := 0;
  v_ids text[];
  v_elem text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if p_entity_type is null or p_entity_type not in ('lead', 'college') then
    raise exception 'entity_type must be lead or college';
  end if;
  if p_task_ids is null or cardinality(p_task_ids) = 0 then
    return 0;
  end if;

  foreach v_task in array p_task_ids
  loop
    if v_task is null then
      continue;
    end if;
    if not exists (
      select 1 from public.tasks t
      where t.id = v_task
        and (t.assigned_to = v_uid or t.assigned_by = v_uid or public.is_admin())
    ) then
      continue;
    end if;

    if p_entity_type = 'lead' then
      select coalesce(
        array(select jsonb_array_elements_text(coalesce(t.client_ids, '[]'::jsonb))),
        '{}'::text[]
      )
      into v_ids
      from public.tasks t
      where t.id = v_task;
    else
      select coalesce(
        array(select jsonb_array_elements_text(coalesce(t.college_visit_ids, '[]'::jsonb))),
        '{}'::text[]
      )
      into v_ids
      from public.tasks t
      where t.id = v_task;
    end if;

    foreach v_elem in array coalesce(v_ids, '{}'::text[])
    loop
      begin
        v_entity := v_elem::uuid;
      exception when others then
        continue;
      end;

      insert into public.employee_crm_pins as p (user_id, entity_type, entity_id, source_task_id, pinned_at)
      values (v_uid, p_entity_type, v_entity, v_task, now())
      on conflict (user_id, entity_type, entity_id) do update
        set source_task_id = excluded.source_task_id,
            pinned_at = excluded.pinned_at;

      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.upsert_my_crm_pins_from_tasks(uuid[], text) to authenticated;

comment on table public.employee_crm_pins is
  'Pinned task-linked leads/colleges shown under employee Student Master / College Visits.';
