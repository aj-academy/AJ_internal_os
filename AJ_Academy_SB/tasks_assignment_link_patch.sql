-- AJ Academy — link tasks to leads (clients) or projects + activity log
-- Run after: task_schema.sql, project_master_schema.sql, employee_lead_management_schema.sql
-- Safe to re-run.

alter table public.tasks
  add column if not exists assignment_type text
    check (assignment_type is null or assignment_type in ('lead', 'project'));

alter table public.tasks
  add column if not exists client_ids jsonb not null default '[]'::jsonb;

comment on column public.tasks.assignment_type is 'Whether this task is linked to leads (clients) or a project.';
comment on column public.tasks.client_ids is 'JSON array of client UUID strings when assignment_type = lead.';

-- ---------------------------------------------------------------------------
-- task_activities — progress / status audit trail
-- ---------------------------------------------------------------------------

create table if not exists public.task_activities (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  activity_type text not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_activities_task_id_idx on public.task_activities (task_id, created_at desc);

alter table public.task_activities enable row level security;

drop policy if exists task_activities_admin_all on public.task_activities;
create policy task_activities_admin_all
on public.task_activities for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists task_activities_assignee_select on public.task_activities;
create policy task_activities_assignee_select
on public.task_activities for select to authenticated
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_activities.task_id
      and t.assigned_to = auth.uid()
  )
);

drop policy if exists task_activities_assignee_insert on public.task_activities;
create policy task_activities_assignee_insert
on public.task_activities for insert to authenticated
with check (
  actor_id = auth.uid()
  and exists (
    select 1 from public.tasks t
    where t.id = task_activities.task_id
      and t.assigned_to = auth.uid()
  )
);

drop policy if exists task_activities_assigner_select on public.task_activities;
create policy task_activities_assigner_select
on public.task_activities for select to authenticated
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_activities.task_id
      and t.assigned_by = auth.uid()
  )
);

drop policy if exists task_activities_assigner_insert on public.task_activities;
create policy task_activities_assigner_insert
on public.task_activities for insert to authenticated
with check (
  actor_id = auth.uid()
  and exists (
    select 1 from public.tasks t
    where t.id = task_activities.task_id
      and t.assigned_by = auth.uid()
  )
);

grant select, insert on public.task_activities to authenticated;
