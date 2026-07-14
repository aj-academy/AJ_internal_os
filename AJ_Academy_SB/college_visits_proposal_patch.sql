-- College Visits — Proposal Tracker fields + PDF storage
-- Run after college_visits_schema.sql (and preferably after crm_owner_isolation.sql).
-- Safe to re-run.

alter table public.college_visits
  add column if not exists proposal_status text not null default 'Not Sent';

alter table public.college_visits
  add column if not exists proposal_amount numeric(12, 2);

alter table public.college_visits
  add column if not exists proposal_sent_date date;

alter table public.college_visits
  add column if not exists proposal_link text;

alter table public.college_visits
  add column if not exists proposal_pdf_url text;

alter table public.college_visits
  add column if not exists proposal_pdf_name text;

create index if not exists college_visits_proposal_status_idx
  on public.college_visits (proposal_status);

-- Public bucket for proposal PDFs; object paths are {user_id}/{college_visit_id}/...
insert into storage.buckets (id, name, public, file_size_limit)
values ('college-visit-proposals', 'college-visit-proposals', true, 10485760)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists college_visit_proposals_storage_read on storage.objects;
create policy college_visit_proposals_storage_read on storage.objects
for select to authenticated
using (bucket_id = 'college-visit-proposals');

drop policy if exists college_visit_proposals_storage_write on storage.objects;
create policy college_visit_proposals_storage_write on storage.objects
for insert to authenticated
with check (
  bucket_id = 'college-visit-proposals'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists college_visit_proposals_storage_update on storage.objects;
create policy college_visit_proposals_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'college-visit-proposals'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'college-visit-proposals'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists college_visit_proposals_storage_delete on storage.objects;
create policy college_visit_proposals_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'college-visit-proposals'
  and (storage.foldername(name))[1] = auth.uid()::text
);
