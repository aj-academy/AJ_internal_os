-- Daily employee mood check-in (popup on login / first visit each day).
-- Run after schema.sql. Storage: public.employee_daily_mood_checkins

create table if not exists public.employee_daily_mood_checkins (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  mood_date date not null default (timezone('Asia/Kolkata', now()))::date,
  mood text not null check (
    mood in ('happy', 'sad', 'angry', 'neutral', 'tired', 'excited')
  ),
  created_at timestamptz not null default now(),
  unique (employee_id, mood_date)
);

create index if not exists employee_daily_mood_checkins_date_idx
  on public.employee_daily_mood_checkins (mood_date desc, created_at desc);

alter table public.employee_daily_mood_checkins enable row level security;

drop policy if exists employee_daily_mood_insert_own on public.employee_daily_mood_checkins;
create policy employee_daily_mood_insert_own
on public.employee_daily_mood_checkins
for insert
to authenticated
with check (employee_id = auth.uid());

drop policy if exists employee_daily_mood_select_own on public.employee_daily_mood_checkins;
create policy employee_daily_mood_select_own
on public.employee_daily_mood_checkins
for select
to authenticated
using (employee_id = auth.uid());

drop policy if exists employee_daily_mood_admin_select on public.employee_daily_mood_checkins;
create policy employee_daily_mood_admin_select
on public.employee_daily_mood_checkins
for select
to authenticated
using (public.is_admin());

grant select, insert on public.employee_daily_mood_checkins to authenticated;
