-- In-app notifications (bell in dashboard topbar). Run after schema.sql + task_schema.sql.
-- Replaces email-based task notifications: app calls RPCs with the user session (no Resend).

create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link_path text,
  read_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists in_app_notifications_user_created_idx
  on public.in_app_notifications (user_id, created_at desc);

create index if not exists in_app_notifications_user_unread_idx
  on public.in_app_notifications (user_id)
  where read_at is null;

alter table public.in_app_notifications enable row level security;

drop policy if exists in_app_notifications_select_own on public.in_app_notifications;
create policy in_app_notifications_select_own
on public.in_app_notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists in_app_notifications_update_own on public.in_app_notifications;
create policy in_app_notifications_update_own
on public.in_app_notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, update on public.in_app_notifications to authenticated;

-- Notify assignee after a task row exists (admin/manager, or employee who set assigned_by).
create or replace function public.create_task_assignment_notification(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  t record;
  role_name text;
begin
  role_name := lower(btrim(coalesce(public.get_user_role(), '')));

  select id, title, assigned_to, assigned_by
  into t
  from public.tasks
  where id = p_task_id;

  if not found then
    return;
  end if;

  if not (
    role_name in ('admin', 'super_admin', 'manager')
    or (t.assigned_by is not null and t.assigned_by = auth.uid())
  ) then
    raise exception 'forbidden';
  end if;

  if t.assigned_to is null or t.assigned_to = auth.uid() then
    return;
  end if;

  insert into public.in_app_notifications (user_id, type, title, body, link_path, meta)
  values (
    t.assigned_to,
    'task_assigned',
    'New task assigned',
    coalesce(nullif(trim(t.title), ''), 'You have a new task'),
    '/employee/my-tasks',
    jsonb_build_object('task_id', t.id)
  );
end;
$$;

grant execute on function public.create_task_assignment_notification(uuid) to authenticated;

-- Notify assigner when assignee marks task completed (call after client updates the task row).
create or replace function public.create_task_completed_notification(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  t record;
  assigner_role text;
  link text;
begin
  select id, title, assigned_to, assigned_by, status
  into t
  from public.tasks
  where id = p_task_id;

  if not found then
    return;
  end if;

  if t.assigned_to is distinct from auth.uid() then
    raise exception 'forbidden';
  end if;

  if lower(coalesce(t.status, '')) <> 'completed' then
    return;
  end if;

  if t.assigned_by is null or t.assigned_by = t.assigned_to then
    return;
  end if;

  select lower(btrim(coalesce(p.role, '')))
  into assigner_role
  from public.profiles p
  where p.id = t.assigned_by;

  link := case
    when assigner_role in ('admin', 'super_admin') then '/admin/task-assignment'
    when assigner_role = 'manager' then '/manager/task-assignment'
    else '/employee/my-tasks'
  end;

  insert into public.in_app_notifications (user_id, type, title, body, link_path, meta)
  values (
    t.assigned_by,
    'task_completed',
    'Task completed',
    coalesce(nullif(trim(t.title), ''), 'Task') || ' was marked completed.',
    link,
    jsonb_build_object('task_id', t.id)
  );
end;
$$;

grant execute on function public.create_task_completed_notification(uuid) to authenticated;
