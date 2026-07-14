-- Unified proposal file upload for Student Master (clients) + College Visits
-- Run after student_lead_master schema + college_visits_proposal_patch.sql
-- Safe to re-run.
--
-- New private bucket: proposals
-- Paths: students/{client_id}/{unique-file}  |  colleges/{college_visit_id}/{unique-file}
-- Keeps proposal_link (and college proposal_pdf_*) for backward compatibility.

-- ========== clients (Student Master) ==========
alter table public.clients add column if not exists proposal_file_name text;
alter table public.clients add column if not exists proposal_file_path text;
alter table public.clients add column if not exists proposal_file_type text;
alter table public.clients add column if not exists proposal_file_size bigint;
alter table public.clients add column if not exists proposal_uploaded_at timestamptz;

-- ========== college_visits ==========
alter table public.college_visits add column if not exists proposal_file_name text;
alter table public.college_visits add column if not exists proposal_file_path text;
alter table public.college_visits add column if not exists proposal_file_type text;
alter table public.college_visits add column if not exists proposal_file_size bigint;
alter table public.college_visits add column if not exists proposal_uploaded_at timestamptz;

-- ========== Storage bucket (private) ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proposals',
  'proposals',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Staff may read objects in proposals (signed URLs preferred; path check still applied)
drop policy if exists proposals_storage_select on storage.objects;
create policy proposals_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'proposals'
  and public.is_admin()
);

drop policy if exists proposals_storage_insert on storage.objects;
create policy proposals_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'proposals'
  and public.is_admin()
);

drop policy if exists proposals_storage_update on storage.objects;
create policy proposals_storage_update on storage.objects
for update to authenticated
using (bucket_id = 'proposals' and public.is_admin())
with check (bucket_id = 'proposals' and public.is_admin());

drop policy if exists proposals_storage_delete on storage.objects;
create policy proposals_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'proposals'
  and public.is_admin()
);

-- Note: App uploads/deletes/signed URLs via server route + service role after staff session check,
-- so employees can also upload through the API even when storage policies require is_admin().
-- Tighten storage policies later if you want direct client-side storage access for employees.
