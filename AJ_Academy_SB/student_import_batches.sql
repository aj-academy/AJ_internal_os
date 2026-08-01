-- Portal student import batches + private storage (Phase 2+).
-- Safe to re-run. Does not touch CRM clients.
-- Prerequisite: profiles (admins), student_portal_profile_fields.sql recommended.

create table if not exists public.student_import_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  file_name text not null,
  storage_path text,
  file_mime text,
  file_size_bytes bigint,
  file_hash text,
  template_version text,
  template_version_ok boolean not null default false,
  detected_headers jsonb not null default '[]'::jsonb,
  data_row_count integer not null default 0,
  status text not null default 'uploaded'
    check (status in (
      'uploaded',
      'validating',
      'ready_for_review',
      'importing',
      'completed',
      'completed_with_errors',
      'failed',
      'cancelled'
    )),
  import_mode text,
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  error_message text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_import_batches_uploaded_at_idx
  on public.student_import_batches (uploaded_at desc);

create index if not exists student_import_batches_uploaded_by_idx
  on public.student_import_batches (uploaded_by);

create index if not exists student_import_batches_file_hash_idx
  on public.student_import_batches (file_hash)
  where file_hash is not null;

create index if not exists student_import_batches_status_idx
  on public.student_import_batches (status);

comment on table public.student_import_batches is
  'Portal student spreadsheet import batches (not CRM Student Master).';

create or replace function public.student_import_batches_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists student_import_batches_touch_trg on public.student_import_batches;
create trigger student_import_batches_touch_trg
before update on public.student_import_batches
for each row execute function public.student_import_batches_touch();

-- Batch number helper: SI-YYYYMMDD-XXXX
create or replace function public.student_import_next_batch_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day text := to_char(timezone('utc', now()), 'YYYYMMDD');
  v_count integer;
begin
  select count(*)::integer into v_count
  from public.student_import_batches
  where batch_number like 'SI-' || v_day || '-%';
  return 'SI-' || v_day || '-' || lpad((v_count + 1)::text, 4, '0');
end;
$$;

grant execute on function public.student_import_next_batch_number() to authenticated;

alter table public.student_import_batches enable row level security;

grant select, insert, update on public.student_import_batches to authenticated;

drop policy if exists student_import_batches_admin_all on public.student_import_batches;
create policy student_import_batches_admin_all
on public.student_import_batches
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Private bucket; uploads go through service-role API only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-imports',
  'student-imports',
  false,
  5242880,
  array[
    'text/csv',
    'text/plain',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No direct client storage policies — admins use server upload with service role.
drop policy if exists student_imports_storage_admin_select on storage.objects;
create policy student_imports_storage_admin_select
on storage.objects
for select to authenticated
using (bucket_id = 'student-imports' and public.is_admin());
