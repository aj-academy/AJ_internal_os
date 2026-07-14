-- Optional section tag on employee task dashboard pins
-- Run after tasks_linked_lead_access.sql. Safe to re-run.

alter table public.employee_task_pins
  add column if not exists pin_section text;

comment on column public.employee_task_pins.pin_section is
  'Dashboard bucket: lead | college | project | all (from My Tasks subsection when pinned).';

-- Backfill from tasks.assignment_type where missing
update public.employee_task_pins p
set pin_section = coalesce(nullif(t.assignment_type, ''), 'all')
from public.tasks t
where p.task_id = t.id
  and (p.pin_section is null or btrim(p.pin_section) = '');
