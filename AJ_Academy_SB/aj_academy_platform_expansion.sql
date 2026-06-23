-- AJ Academy platform expansion
-- Run after: schema.sql, attendance_module.sql, task_schema.sql, in_app_notifications.sql
-- Adds: course, assigned_mentor_id, mentor helpers, task attachments, counselling, notification RPCs

-- Profiles
alter table public.profiles add column if not exists course text;
alter table public.profiles add column if not exists assigned_mentor_id uuid references public.profiles (id) on delete set null;
create index if not exists profiles_assigned_mentor_idx on public.profiles (assigned_mentor_id);
create index if not exists profiles_course_idx on public.profiles (course);

comment on column public.profiles.course is 'Academic / training course (from Settings courses list).';
comment on column public.profiles.assigned_mentor_id is 'Primary mentor for a student (counselling visibility).';

-- Tasks: optional attachment metadata [{name, url, mime, size}]
alter table public.tasks add column if not exists attachment_urls jsonb not null default '[]'::jsonb;

-- Counselling sessions (admin schedules for students)
create table if not exists public.counselling_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles (id) on delete set null,
  student_display_name text,
  student_email text,
  mentor_id uuid references public.profiles (id) on delete set null,
  scheduled_by uuid references public.profiles (id) on delete set null,
  purpose text not null,
  mode text not null default 'online' check (mode in ('online', 'offline')),
  session_at timestamptz not null,
  duration_minutes integer default 30,
  meeting_link text,
  venue text,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists counselling_sessions_student_idx on public.counselling_sessions (student_id, session_at desc);
create index if not exists counselling_sessions_mentor_idx on public.counselling_sessions (mentor_id, session_at desc);

-- Storage bucket for task attachments (run in Supabase dashboard if insert fails)
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', true)
on conflict (id) do nothing;

-- Mentor helpers (counselling visibility)
create or replace function public.is_mentor_role()
returns boolean
language sql stable security definer set search_path = public
as $$ select lower(btrim(coalesce(public.get_user_role(), ''))) = 'mentor'; $$;

create or replace function public.mentor_can_see_profile(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public set row_security = off
as $$
  select exists (
    select 1
    from public.profiles me
    join public.profiles s on s.id = p_profile_id
    where me.id = auth.uid()
      and public.is_mentor_role()
      and lower(coalesce(s.role, '')) = 'student'
      and (
        s.assigned_mentor_id = me.id
        or (
          btrim(coalesce(s.department, '')) <> ''
          and lower(btrim(coalesce(s.department, ''))) = lower(btrim(coalesce(me.department, '')))
        )
      )
  );
$$;

grant execute on function public.mentor_can_see_profile(uuid) to authenticated;

-- Counselling RLS
alter table public.counselling_sessions enable row level security;
grant select, insert, update, delete on public.counselling_sessions to authenticated;

drop policy if exists counselling_admin_all on public.counselling_sessions;
create policy counselling_admin_all on public.counselling_sessions for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists counselling_student_select on public.counselling_sessions;
create policy counselling_student_select on public.counselling_sessions for select to authenticated
using (student_id = auth.uid());

drop policy if exists counselling_mentor_select on public.counselling_sessions;
create policy counselling_mentor_select on public.counselling_sessions for select to authenticated
using (mentor_id = auth.uid() or public.mentor_can_see_profile(student_id));

-- Task assignment notifications: mentor + freelancer assigners, role-based links
create or replace function public.create_task_assignment_notification(p_task_id uuid)
returns void language plpgsql security definer set search_path = public set row_security = off as $$
declare
  t record;
  role_name text;
  assignee_role text;
  link text;
begin
  role_name := lower(btrim(coalesce(public.get_user_role(), '')));

  select id, title, assigned_to, assigned_by into t from public.tasks where id = p_task_id;
  if not found then return; end if;

  if not (
    role_name in ('admin', 'super_admin', 'manager', 'mentor', 'freelancer')
    or (t.assigned_by is not null and t.assigned_by = auth.uid())
  ) then
    raise exception 'forbidden';
  end if;

  if t.assigned_to is null or t.assigned_to = auth.uid() then return; end if;

  select lower(btrim(coalesce(role, ''))) into assignee_role from public.profiles where id = t.assigned_to;

  link := case assignee_role
    when 'student' then '/student/my-tasks'
    when 'freelancer' then '/freelancer/my-tasks'
    when 'mentor' then '/mentor/my-tasks'
    when 'admin' then '/admin/task-assignment'
    when 'super_admin' then '/admin/task-assignment'
    else '/student/my-tasks'
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

create or replace function public.create_task_completed_notification(p_task_id uuid)
returns void language plpgsql security definer set search_path = public set row_security = off as $$
declare
  t record;
  assigner_role text;
  link text;
begin
  select id, title, assigned_to, assigned_by, status into t from public.tasks where id = p_task_id;
  if not found then return; end if;
  if t.assigned_to is distinct from auth.uid() then raise exception 'forbidden'; end if;
  if lower(coalesce(t.status, '')) <> 'completed' then return; end if;
  if t.assigned_by is null or t.assigned_by = t.assigned_to then return; end if;

  select lower(btrim(coalesce(p.role, ''))) into assigner_role from public.profiles p where p.id = t.assigned_by;

  link := case assigner_role
    when 'admin' then '/admin/task-assignment'
    when 'super_admin' then '/admin/task-assignment'
    when 'mentor' then '/mentor/my-tasks'
    when 'freelancer' then '/freelancer/assign-tasks'
    when 'manager' then '/manager/task-assignment'
    else '/admin/task-assignment'
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

grant execute on function public.create_task_assignment_notification(uuid) to authenticated;
grant execute on function public.create_task_completed_notification(uuid) to authenticated;

drop policy if exists in_app_notifications_admin_insert on public.in_app_notifications;
create policy in_app_notifications_admin_insert
on public.in_app_notifications for insert to authenticated
with check (public.is_admin());

-- Task attachment uploads (authenticated users)
drop policy if exists task_attachments_auth_upload on storage.objects;
create policy task_attachments_auth_upload on storage.objects for insert to authenticated
with check (bucket_id = 'task-attachments');

drop policy if exists task_attachments_public_read on storage.objects;
create policy task_attachments_public_read on storage.objects for select to authenticated
using (bucket_id = 'task-attachments');
