-- College Visits: who visited the college (safe to re-run)
-- Run after: college_visits_schema.sql
-- Supports both column names used across branches:
--   visited_by      (production / main)
--   visited_by_name (earlier feature branch)

alter table if exists public.college_visits
  add column if not exists visited_by text;

alter table if exists public.college_visits
  add column if not exists visited_by_name text;

comment on column public.college_visits.visited_by is
  'Name of AJ Academy person who visited the college';

comment on column public.college_visits.visited_by_name is
  'Legacy/alternate visitor name field; prefer visited_by in the UI';
