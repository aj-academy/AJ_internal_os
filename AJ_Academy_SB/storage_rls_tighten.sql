-- AJ Academy — tighten storage bucket access (run after bucket schemas exist)
-- Restricts reads/uploads to owner folders where possible.

-- task-attachments: drop overly broad policies if present
drop policy if exists task_attachments_auth_upload on storage.objects;
drop policy if exists task_attachments_public_read on storage.objects;

create policy task_attachments_owner_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'task-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy task_attachments_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'task-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

-- reimbursement-bills: owner folder only
drop policy if exists reimbursement_bills_auth_upload on storage.objects;
drop policy if exists reimbursement_bills_auth_read on storage.objects;

create policy reimbursement_bills_owner_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'reimbursement-bills'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy reimbursement_bills_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'reimbursement-bills'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

-- attendance-selfies: owner folder + admin
drop policy if exists attendance_selfies_auth_upload on storage.objects;
drop policy if exists attendance_selfies_auth_read on storage.objects;

create policy attendance_selfies_owner_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attendance-selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy attendance_selfies_owner_read
on storage.objects for select to authenticated
using (
  bucket_id = 'attendance-selfies'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);
