-- AJ Academy — Project Master + tasks.project_id
-- Run AFTER: schema.sql, task_schema.sql (public.tasks + profiles).
-- Path: AJ_Academy_SB/project_master_schema.sql
--
-- Creates: clients (minimal stub if missing), projects, project_activities, project_team_members
-- Adds: tasks.project_id + trigger to sync task counts / progress on projects
-- Optional later: client_lead_schema.sql upgrades clients for full CRM (not required for tasks).
-- RLS: admin full; manager read/update projects they manage or are on; employee read team projects;
--       accounts read all projects (financial visibility); task visibility extended for project team.
-- RLS helpers (SECURITY DEFINER) avoid recursion between projects, project_team_members, and policies
-- that referenced the same table twice (e.g. EXISTS (SELECT … FROM project_team_members …) inside ptm RLS).

create extension if not exists pgcrypto;

-- ------------------------------
-- clients (minimal — AJ Academy does not require client_lead_schema.sql first)
-- ------------------------------

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  lead_name text,
  company_name text,
  status text not null default 'Active',
  updated_at timestamptz not null default now()
);

create index if not exists clients_updated_at_idx on public.clients (updated_at desc);

alter table public.clients enable row level security;

drop policy if exists "clients_admin_all" on public.clients;
create policy "clients_admin_all"
on public.clients
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);

-- ------------------------------
-- projects
-- ------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_code text,
  project_name text not null,
  client_id uuid references public.clients (id) on delete set null,
  project_type text,
  description text,
  priority text default 'Medium',
  status text default 'Planning',
  start_date date,
  deadline date,
  estimated_completion date,
  budget numeric(14, 2),
  advance_paid numeric(14, 2) default 0,
  pending_amount numeric(14, 2) default 0,
  project_manager uuid references public.profiles (id),
  assigned_team jsonb default '[]'::jsonb,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  total_tasks integer not null default 0,
  completed_tasks integer not null default 0,
  delayed_tasks integer not null default 0,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_client_id_idx on public.projects (client_id);
create index if not exists projects_status_idx on public.projects (status);
create index if not exists projects_manager_idx on public.projects (project_manager);
create index if not exists projects_deadline_idx on public.projects (deadline);
create index if not exists projects_created_at_idx on public.projects (created_at desc);

create or replace function public.projects_set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at_trigger on public.projects;
create trigger projects_set_updated_at_trigger
before update on public.projects
for each row
execute function public.projects_set_updated_at ();

-- ------------------------------
-- project_team_members (RLS-friendly; app syncs from assigned_team JSON)
-- ------------------------------

create table if not exists public.project_team_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text,
  created_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);

create index if not exists project_team_members_profile_idx on public.project_team_members (profile_id);

-- ------------------------------
-- project_activities
-- ------------------------------

create table if not exists public.project_activities (
  id uuid primary key default gen_random_uuid (),
  project_id uuid not null references public.projects (id) on delete cascade,
  activity_type text not null,
  notes text,
  old_value text,
  new_value text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now ()
);

create index if not exists project_activities_project_id_idx on public.project_activities (project_id);
create index if not exists project_activities_created_at_idx on public.project_activities (created_at desc);

create or replace function public.projects_refresh_task_aggregates (p_project_id uuid)
returns void
language plpgsql
as $$
declare
  v_total int;
  v_done int;
  v_delayed int;
  v_prog int;
begin
  if p_project_id is null then
    return;
  end if;

  select count(*)::int into v_total from public.tasks where project_id = p_project_id;
  select count(*)::int into v_done from public.tasks where project_id = p_project_id and status = 'Completed';
  select count(*)::int
  into v_delayed
  from public.tasks
  where
    project_id = p_project_id
    and due_date is not null
    and due_date < (current_timestamp at time zone 'utc')::date
    and status <> 'Completed';

  if v_total > 0 then
    v_prog := least(100, greatest(0, round((v_done::numeric / v_total::numeric) * 100)));
  else
    v_prog := 0;
  end if;

  update public.projects
  set
    total_tasks = v_total,
    completed_tasks = v_done,
    delayed_tasks = v_delayed,
    progress = v_prog,
    updated_at = now()
  where
    id = p_project_id;
end;
$$;

-- ------------------------------
-- Link tasks → projects
-- ------------------------------

alter table public.tasks add column if not exists project_id uuid references public.projects (id) on delete set null;

create index if not exists tasks_project_id_idx on public.tasks (project_id);

create or replace function public.tasks_touch_project_stats ()
returns trigger
language plpgsql
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if tg_op = 'DELETE' then
    v_old := old.project_id;
    if v_old is not null then
      perform public.projects_refresh_task_aggregates (v_old);
    end if;
    return old;
  end if;

  v_new := new.project_id;
  if tg_op = 'INSERT' then
    if v_new is not null then
      perform public.projects_refresh_task_aggregates (v_new);
    end if;
    return new;
  end if;

  -- UPDATE
  v_old := old.project_id;
  v_new := new.project_id;
  if v_old is distinct from v_new then
    if v_old is not null then
      perform public.projects_refresh_task_aggregates (v_old);
    end if;
    if v_new is not null then
      perform public.projects_refresh_task_aggregates (v_new);
    end if;
  elsif v_new is not null and (
    old.status is distinct from new.status
    or old.due_date is distinct from new.due_date
    or old.progress is distinct from new.progress
  ) then
    perform public.projects_refresh_task_aggregates (v_new);
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_touch_project_stats_trigger on public.tasks;
create trigger tasks_touch_project_stats_trigger
after insert or update or delete on public.tasks
for each row
execute function public.tasks_touch_project_stats ();

-- ------------------------------
-- RLS: projects
-- ------------------------------

alter table public.projects enable row level security;

-- RLS helpers (SECURITY DEFINER): avoid infinite recursion.
-- 1) projects <-> project_team_members when policies subquery the other table with RLS on.
-- 2) project_team_members policy must NOT subquery project_team_members (re-enters same policy).
create or replace function public.project_actor_is_manager_of (p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects pr
    where
      pr.id = p_project_id
      and pr.project_manager = auth.uid ()
  );
$$;

create or replace function public.project_actor_is_team_member (p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_team_members m
    where
      m.project_id = p_project_id
      and m.profile_id = auth.uid ()
  );
$$;

create or replace function public.project_principal_has_access (p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.project_actor_is_manager_of (p_project_id)
    or public.project_actor_is_team_member (p_project_id);
$$;

revoke all on function public.project_actor_is_manager_of (uuid) from public;
revoke all on function public.project_actor_is_team_member (uuid) from public;
revoke all on function public.project_principal_has_access (uuid) from public;
grant execute on function public.project_actor_is_manager_of (uuid) to authenticated;
grant execute on function public.project_actor_is_team_member (uuid) to authenticated;
grant execute on function public.project_principal_has_access (uuid) to authenticated;

drop policy if exists "projects_admin_all" on public.projects;
create policy "projects_admin_all"
on public.projects
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists "projects_accounts_select" on public.projects;
create policy "projects_accounts_select"
on public.projects
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('accounts', 'account')
  )
);

drop policy if exists "projects_manager_select_update" on public.projects;
create policy "projects_manager_select_update"
on public.projects
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'manager'
  )
  and (
    project_manager = auth.uid ()
    or public.project_actor_is_team_member (projects.id)
  )
);

drop policy if exists "projects_manager_update" on public.projects;
create policy "projects_manager_update"
on public.projects
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'manager'
  )
  and (
    project_manager = auth.uid ()
    or public.project_actor_is_team_member (projects.id)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'manager'
  )
  and (
    project_manager = auth.uid ()
    or public.project_actor_is_team_member (projects.id)
  )
);

drop policy if exists "projects_employee_select_team" on public.projects;
create policy "projects_employee_select_team"
on public.projects
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'employee'
  )
  and (
    project_manager = auth.uid ()
    or public.project_actor_is_team_member (projects.id)
  )
);

-- ------------------------------
-- RLS: project_team_members
-- ------------------------------

alter table public.project_team_members enable row level security;

drop policy if exists "project_team_members_admin_all" on public.project_team_members;
create policy "project_team_members_admin_all"
on public.project_team_members
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists "project_team_members_accounts_select" on public.project_team_members;
create policy "project_team_members_accounts_select"
on public.project_team_members
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('accounts', 'account')
  )
);

drop policy if exists "project_team_members_member_select" on public.project_team_members;
create policy "project_team_members_member_select"
on public.project_team_members
for select
to authenticated
using (
  profile_id = auth.uid ()
  or public.project_actor_is_manager_of (project_team_members.project_id)
  or public.project_actor_is_team_member (project_team_members.project_id)
);

-- ------------------------------
-- RLS: project_activities
-- ------------------------------

alter table public.project_activities enable row level security;

drop policy if exists "project_activities_admin_all" on public.project_activities;
create policy "project_activities_admin_all"
on public.project_activities
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);

drop policy if exists "project_activities_accounts_select" on public.project_activities;
create policy "project_activities_accounts_select"
on public.project_activities
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('accounts', 'account')
  )
);

drop policy if exists "project_activities_member_select" on public.project_activities;
create policy "project_activities_member_select"
on public.project_activities
for select
to authenticated
using (public.project_principal_has_access (project_activities.project_id));

drop policy if exists "project_activities_member_insert" on public.project_activities;
create policy "project_activities_member_insert"
on public.project_activities
for insert
to authenticated
with check (public.project_principal_has_access (project_activities.project_id));

-- ------------------------------
-- Tasks: employees on project team can read project tasks
-- ------------------------------

drop policy if exists "tasks_employee_select_assigned" on public.tasks;
create policy "tasks_employee_select_assigned"
on public.tasks
for select
to authenticated
using (
  assigned_to = auth.uid ()
  or (
    project_id is not null
    and public.project_actor_is_team_member (tasks.project_id)
  )
  or (
    project_id is not null
    and public.project_actor_is_manager_of (tasks.project_id)
  )
);

-- ------------------------------
-- Realtime (optional)
-- ------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;

  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'project_activities'
  ) then
    alter publication supabase_realtime add table public.project_activities;
  end if;

  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'project_team_members'
  ) then
    alter publication supabase_realtime add table public.project_team_members;
  end if;
end
$$;
