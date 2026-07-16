-- College Visits patch: add visited_by column (safe to re-run)
alter table public.college_visits
  add column if not exists visited_by text;

comment on column public.college_visits.visited_by is
  'Name of AJ Academy person who visited the college';
