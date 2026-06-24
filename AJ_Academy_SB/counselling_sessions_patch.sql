-- Counselling fix / patch — safe to re-run
-- Run in Supabase SQL Editor if Admin → Counselling shows a schema warning.
-- Fixes: missing table, missing student_display_name / student_email columns, RLS.

alter table public.profiles add column if not exists assigned_mentor_id uuid references public.profiles (id) on delete set null;

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

alter table public.counselling_sessions add column if not exists student_display_name text;
alter table public.counselling_sessions add column if not exists student_email text;
alter table public.counselling_sessions alter column student_id drop not null;

create index if not exists counselling_sessions_student_idx on public.counselling_sessions (student_id, session_at desc);
create index if not exists counselling_sessions_mentor_idx on public.counselling_sessions (mentor_id, session_at desc);

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

notify pgrst, 'reload schema';
