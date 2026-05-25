-- Preserve assignee identity on tasks when a profile/auth user is removed (e.g. freelancer offboard).
-- Run after task_schema.sql and task_notifications_columns.sql.

alter table public.tasks add column if not exists assignee_name text;
alter table public.tasks add column if not exists assignee_email text;

comment on column public.tasks.assignee_name is 'Snapshot of assignee full name when profile is offboarded.';
comment on column public.tasks.assignee_email is 'Snapshot of assignee email when profile is offboarded.';

-- Allow profile removal while keeping task rows
alter table public.tasks alter column assigned_to drop not null;

alter table public.tasks drop constraint if exists tasks_assigned_to_fkey;

alter table public.tasks
  add constraint tasks_assigned_to_fkey
  foreign key (assigned_to) references public.profiles (id) on delete set null;
