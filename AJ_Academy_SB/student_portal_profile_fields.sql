-- Portal student fields for bulk import / directory (profiles = Auth users).
-- Safe to re-run. Does not touch CRM clients.
-- Run after schema.sql + aj_academy_platform_expansion.sql (+ LMS academic foundation recommended).

alter table public.profiles
  add column if not exists registration_number text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists alternate_phone text,
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists parent_guardian_name text,
  add column if not exists parent_guardian_phone text,
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists college_name text,
  add column if not exists roll_number text,
  add column if not exists section text,
  add column if not exists academic_year text,
  add column if not exists year_of_study text,
  add column if not exists semester text,
  add column if not exists admission_date date,
  add column if not exists admission_type text,
  add column if not exists scholarship_type text,
  add column if not exists linkedin_url text,
  add column if not exists github_url text,
  add column if not exists portfolio_url text,
  add column if not exists student_notes text;

comment on column public.profiles.registration_number is
  'Portal student registration / student ID. Unique when present.';
comment on column public.profiles.phone is
  'Primary mobile for portal students (and optional for other roles).';

-- Case-insensitive uniqueness for non-blank registration numbers
create unique index if not exists profiles_registration_number_uidx
  on public.profiles (lower(btrim(registration_number)))
  where registration_number is not null and btrim(registration_number) <> '';

-- Keep full_name in sync when first/last are set (import + forms may set either)
create or replace function public.profiles_compose_full_name()
returns trigger
language plpgsql
as $$
begin
  if (new.first_name is not null or new.last_name is not null) then
    new.full_name := nullif(
      btrim(concat_ws(' ', nullif(btrim(coalesce(new.first_name, '')), ''), nullif(btrim(coalesce(new.last_name, '')), ''))),
      ''
    );
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_compose_full_name_trg on public.profiles;
create trigger profiles_compose_full_name_trg
before insert or update of first_name, last_name
on public.profiles
for each row
execute function public.profiles_compose_full_name();
