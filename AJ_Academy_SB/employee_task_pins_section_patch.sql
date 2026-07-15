-- Fix: Pin selected to dashboard for assigned Student Lead / College / Project tasks.
-- Run after tasks_linked_lead_access.sql (or when pin button appears to do nothing).
-- Safe to re-run.

alter table public.employee_task_pins
  add column if not exists pin_section text;

alter table public.employee_task_pins
  add column if not exists pinned_at timestamptz not null default now();

comment on column public.employee_task_pins.pin_section is
  'Dashboard bucket: lead | college | project | all (from My Tasks subsection when pinned).';

-- Bypass tasks RLS when checking pin eligibility (nested RLS in WITH CHECK often fails quietly
-- or returns opaque errors for assignees).
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

-- Atomic pin for My Tasks bulk/individual "Pin to dashboard"
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

comment on function public.upsert_my_task_pins(uuid[], text) is
  'Pin assigned/delegated tasks to the current user dashboard (lead/college/project buckets).';

-- Backfill missing sections from task type
update public.employee_task_pins p
set pin_section = coalesce(nullif(t.assignment_type, ''), 'all')
from public.tasks t
where p.task_id = t.id
  and (p.pin_section is null or btrim(p.pin_section) = '');
