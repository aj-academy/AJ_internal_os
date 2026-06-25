-- Member reimbursement: drafts, bill attachments, storage (run after reimbursement_schema_patch.sql)

alter table public.expense_claims
  add column if not exists bill_urls jsonb not null default '[]'::jsonb;

alter table public.expense_claims drop constraint if exists expense_claims_approval_status_check;
alter table public.expense_claims
  add constraint expense_claims_approval_status_check
  check (
    approval_status in (
      'Draft',
      'Pending',
      'Approved',
      'Rejected',
      'Special Approval Required',
      'Reimbursed'
    )
  );

insert into storage.buckets (id, name, public, file_size_limit)
values ('reimbursement-bills', 'reimbursement-bills', true, 5242880)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists reimbursement_bills_storage_read on storage.objects;
create policy reimbursement_bills_storage_read on storage.objects
for select to authenticated
using (bucket_id = 'reimbursement-bills');

drop policy if exists reimbursement_bills_storage_member_write on storage.objects;
create policy reimbursement_bills_storage_member_write on storage.objects
for insert to authenticated
with check (
  bucket_id = 'reimbursement-bills'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists reimbursement_bills_storage_member_update on storage.objects;
create policy reimbursement_bills_storage_member_update on storage.objects
for update to authenticated
using (
  bucket_id = 'reimbursement-bills'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'reimbursement-bills'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "expense_claims_portal_member_update_own_pending" on public.expense_claims;
create policy "expense_claims_portal_member_update_own"
on public.expense_claims
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('employee', 'mentor', 'freelancer')
  )
  and employee_id = auth.uid ()
  and approval_status in ('Draft', 'Pending')
)
with check (employee_id = auth.uid ());

drop policy if exists "expense_claims_portal_member_delete_draft" on public.expense_claims;
create policy "expense_claims_portal_member_delete_draft"
on public.expense_claims
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('employee', 'mentor', 'freelancer')
  )
  and employee_id = auth.uid ()
  and approval_status = 'Draft'
);
