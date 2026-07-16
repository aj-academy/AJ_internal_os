-- Multiple proposal files per entity (Student + College)
-- Run after proposals_file_upload_patch.sql
-- Safe to re-run.

create table if not exists public.proposal_files (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('student','college')),
  entity_id uuid not null,
  file_name text not null,
  file_path text not null unique,
  file_type text,
  file_size bigint,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id) on delete set null
);

create index if not exists proposal_files_entity_idx
  on public.proposal_files (entity_type, entity_id, uploaded_at desc);

alter table public.proposal_files enable row level security;

drop policy if exists proposal_files_staff_select on public.proposal_files;
create policy proposal_files_staff_select
on public.proposal_files for select to authenticated
using (public.is_admin() or public.is_employee());

drop policy if exists proposal_files_staff_insert on public.proposal_files;
create policy proposal_files_staff_insert
on public.proposal_files for insert to authenticated
with check (public.is_admin() or public.is_employee());

drop policy if exists proposal_files_staff_delete on public.proposal_files;
create policy proposal_files_staff_delete
on public.proposal_files for delete to authenticated
using (public.is_admin() or public.is_employee());

grant select, insert, delete on public.proposal_files to authenticated;

comment on table public.proposal_files is
  'Stores multiple uploaded proposal files for Student Master and College Visits entities.';
