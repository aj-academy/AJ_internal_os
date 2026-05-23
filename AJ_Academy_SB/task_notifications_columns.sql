-- Task assignment / completion metadata (run in Supabase SQL Editor after task_schema.sql)
-- Path: AJ_Academy_SB/task_notifications_columns.sql

alter table public.tasks add column if not exists assigned_by uuid references public.profiles (id);
alter table public.tasks add column if not exists completion_summary text;

create index if not exists tasks_assigned_by_idx on public.tasks (assigned_by);

comment on column public.tasks.assigned_by is 'Profile id of user who created or last reassigned this task; used for in-app completion notifications.';
comment on column public.tasks.completion_summary is 'Optional text submitted by assignee when marking the task completed.';
