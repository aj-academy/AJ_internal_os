-- College Visits — institution outreach / MOU tracking
-- Run after schema.sql (profiles + get_user_role / is_admin).
-- Safe to re-run.

-- Ensure is_employee() exists (also defined in employee_student_master_rls.sql)
create or replace function public.is_employee()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select lower(btrim(coalesce(public.get_user_role(), ''))) = 'employee';
$$;

grant execute on function public.is_employee() to authenticated;

create table if not exists public.college_visits (
  id uuid primary key default gen_random_uuid(),
  college_name text not null,
  location text,
  contact_number text,
  email text,
  connected_person_name text,
  connected_person_role text,
  visit_status text not null default 'Not Visited',
  visited_by_name text,
  visit_date date,
  mou_signed_status text not null default 'Not Signed',
  follow_up_stage text,
  last_follow_up_date date,
  next_follow_up_date date,
  priority text not null default 'Warm',
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  description text,
  last_outcome_remarks text,
  lead_score integer not null default 0,
  final_status text not null default 'Open',
  source_reference text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists college_visits_college_name_idx on public.college_visits (college_name);
create index if not exists college_visits_assigned_to_idx on public.college_visits (assigned_to);
create index if not exists college_visits_visit_status_idx on public.college_visits (visit_status);
create index if not exists college_visits_next_follow_up_idx on public.college_visits (next_follow_up_date);
create index if not exists college_visits_updated_at_idx on public.college_visits (updated_at desc);

create or replace function public.college_visits_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists college_visits_updated_at on public.college_visits;
create trigger college_visits_updated_at
before update on public.college_visits
for each row execute function public.college_visits_set_updated_at();

-- Activity log
create table if not exists public.college_visit_activities (
  id uuid primary key default gen_random_uuid(),
  college_visit_id uuid not null references public.college_visits(id) on delete cascade,
  activity_type text not null,
  notes text,
  old_value text,
  new_value text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists college_visit_activities_visit_id_idx
  on public.college_visit_activities (college_visit_id);
create index if not exists college_visit_activities_created_at_idx
  on public.college_visit_activities (created_at desc);

alter table public.college_visits enable row level security;
alter table public.college_visit_activities enable row level security;

-- Admin full access
drop policy if exists college_visits_admin_all on public.college_visits;
create policy college_visits_admin_all
on public.college_visits for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists college_visit_activities_admin_all on public.college_visit_activities;
create policy college_visit_activities_admin_all
on public.college_visit_activities for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Employee full CRM (visit updates, field visits)
drop policy if exists college_visits_employee_all on public.college_visits;
create policy college_visits_employee_all
on public.college_visits for all to authenticated
using (public.is_employee())
with check (public.is_employee());

drop policy if exists college_visit_activities_employee_all on public.college_visit_activities;
create policy college_visit_activities_employee_all
on public.college_visit_activities for all to authenticated
using (public.is_employee())
with check (public.is_employee());

grant select, insert, update, delete on public.college_visits to authenticated;
grant select, insert, update, delete on public.college_visit_activities to authenticated;

comment on table public.college_visits is 'College / institution visit outreach tracker';
comment on table public.college_visit_activities is 'Activity timeline for college visits';
