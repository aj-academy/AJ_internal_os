-- Run after aj_academy_platform_expansion.sql
-- Optional student email + display name for walk-in / external counselling (no dashboard account).

alter table public.counselling_sessions
  add column if not exists student_display_name text;

alter table public.counselling_sessions
  add column if not exists student_email text;

alter table public.counselling_sessions
  alter column student_id drop not null;

comment on column public.counselling_sessions.student_display_name is 'Free-text student name when scheduling counselling.';
comment on column public.counselling_sessions.student_email is 'Optional contact email — used to send meeting link when student has no dashboard login.';
