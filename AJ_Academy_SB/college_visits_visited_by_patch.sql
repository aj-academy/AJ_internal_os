-- College Visits: add visited_by_name field for who performed the visit
-- Safe to re-run.
-- Run after: college_visits_schema.sql

alter table if exists public.college_visits
  add column if not exists visited_by_name text;

comment on column public.college_visits.visited_by_name
is 'Name of staff member who physically visited the college';
