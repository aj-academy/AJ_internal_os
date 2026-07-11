-- Link tasks to college visits (College Visits module)
-- Run after tasks_assignment_link_patch.sql and college_visits_schema.sql
-- Safe to re-run.

alter table public.tasks drop constraint if exists tasks_assignment_type_check;

alter table public.tasks
  add constraint tasks_assignment_type_check
  check (assignment_type is null or assignment_type in ('lead', 'project', 'college'));

alter table public.tasks
  add column if not exists college_visit_ids jsonb not null default '[]'::jsonb;

comment on column public.tasks.college_visit_ids is 'JSON array of college_visits UUID strings when assignment_type = college.';
