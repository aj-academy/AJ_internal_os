-- College Visits — multiple contacts (name, role, phones, email) as JSON
-- Run AFTER college_visits_schema.sql (+ proposal patch if used).
-- Safe to re-run.
--
-- Shape of each contact object:
--   { "id": "uuid", "name": "...", "role": "...", "phones": ["...", "..."], "email": "...", "is_primary": true }
-- Legacy columns contact_number / email / connected_person_* stay in sync with the primary contact.

alter table public.college_visits
  add column if not exists contacts jsonb not null default '[]'::jsonb;

comment on column public.college_visits.contacts is
  'Array of college contacts: id, name, role, phones[], email, is_primary. Primary syncs to contact_number / email / connected_person_*.';

-- Backfill one primary contact from legacy columns where contacts is empty
update public.college_visits cv
set contacts = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', coalesce(nullif(btrim(cv.connected_person_name), ''), ''),
    'role', coalesce(nullif(btrim(cv.connected_person_role), ''), ''),
    'phones', case
      when nullif(btrim(cv.contact_number), '') is null then '[]'::jsonb
      else jsonb_build_array(btrim(cv.contact_number))
    end,
    'email', coalesce(nullif(btrim(cv.email), ''), ''),
    'is_primary', true
  )
)
where coalesce(jsonb_array_length(cv.contacts), 0) = 0
  and (
    nullif(btrim(cv.contact_number), '') is not null
    or nullif(btrim(cv.connected_person_name), '') is not null
    or nullif(btrim(cv.email), '') is not null
  );
