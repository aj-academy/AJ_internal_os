-- Fix task notification deep-links for employees (+ backfill)
-- aj_academy_platform_expansion.sql mapped unknown roles (including employee) to /student/my-tasks.
-- Run after in_app_notifications.sql / aj_academy_platform_expansion.sql. Safe to re-run.

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
  assignee_role text;
  link text;
begin
  select lower(btrim(coalesce(public.get_user_role(), ''))) into role_name;

  select id, title, assigned_to, assigned_by into t from public.tasks where id = p_task_id;
  if not found then return; end if;

  if not (
    role_name in ('admin', 'super_admin', 'manager', 'mentor', 'freelancer', 'employee')
    or (t.assigned_by is not null and t.assigned_by = auth.uid())
  ) then
    raise exception 'forbidden';
  end if;

  if t.assigned_to is null or t.assigned_to = auth.uid() then return; end if;

  select lower(btrim(coalesce(role, ''))) into assignee_role from public.profiles where id = t.assigned_to;

  link := case assignee_role
    when 'employee' then '/employee/my-tasks'
    when 'student' then '/student/my-tasks'
    when 'freelancer' then '/freelancer/my-tasks'
    when 'mentor' then '/mentor/my-tasks'
    when 'admin' then '/admin/task-assignment'
    when 'super_admin' then '/admin/task-assignment'
    else '/employee/my-tasks'
  end;

  insert into public.in_app_notifications (user_id, type, title, body, link_path, meta)
  values (
    t.assigned_to,
    'task_assigned',
    'New task assigned',
    coalesce(nullif(trim(t.title), ''), 'You have a new task'),
    link,
    jsonb_build_object('task_id', t.id)
  );
end;
$$;

grant execute on function public.create_task_assignment_notification(uuid) to authenticated;

-- Backfill bad employee links from the old default
update public.in_app_notifications n
set link_path = '/employee/my-tasks'
from public.profiles p
where n.user_id = p.id
  and lower(btrim(coalesce(p.role, ''))) = 'employee'
  and n.link_path in ('/student/my-tasks', '/student/dashboard');

comment on function public.create_task_assignment_notification(uuid) is
  'Creates in-app notification for task assignee with role-correct My Tasks link (employee → /employee/my-tasks).';
