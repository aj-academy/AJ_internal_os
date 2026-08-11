-- Private attendance-selfies bucket + path normalization for check_in_selfie_url.
-- Safe to re-run. Does NOT delete objects.
--
-- BEFORE:
--   Bucket attendance-selfies is public (attendance_selfie_schema.sql).
--   Many rows store full public URLs in check_in_selfie_url.
--
-- AFTER:
--   Bucket is private.
--   check_in_selfie_url stores object path (uid/YYYY-MM-DD-checkin.jpg) when extractable.
--   App mints short-lived signed URLs via /api/attendance/selfie.
--
-- Impact:
--   Old public URLs stop working for anonymous access (intentional).
--   Rows that cannot be parsed keep original text; signed-url API will fail until re-upload.
--
-- Rollback (re-publicize — not recommended):
--   update storage.buckets set public = true where id = 'attendance-selfies';

-- 1) Make bucket private
update storage.buckets
set public = false
where id = 'attendance-selfies';

-- 2) Normalize public URL values → object path (best-effort)
update public.attendance_records
set check_in_selfie_url = nullif(
  regexp_replace(
    check_in_selfie_url,
    '^.*(?:/object/(?:public|sign)/attendance-selfies/|/storage/v1/object/(?:public|sign)/attendance-selfies/|/attendance-selfies/)',
    ''
  ),
  ''
)
where check_in_selfie_url is not null
  and check_in_selfie_url ~* 'attendance-selfies';

-- Strip query string leftovers
update public.attendance_records
set check_in_selfie_url = split_part(check_in_selfie_url, '?', 1)
where check_in_selfie_url is not null
  and check_in_selfie_url like '%?%';

-- 3) Storage policies: owner folder upload/read + admin (drop broad authenticated select)
drop policy if exists "attendance_selfies_select_authenticated" on storage.objects;
drop policy if exists attendance_selfies_select_authenticated on storage.objects;
drop policy if exists attendance_selfies_owner_upload on storage.objects;
drop policy if exists attendance_selfies_owner_read on storage.objects;
drop policy if exists "attendance_selfies_insert_own" on storage.objects;
drop policy if exists "attendance_selfies_update_own" on storage.objects;
drop policy if exists "attendance_selfies_admin_all" on storage.objects;

create policy attendance_selfies_owner_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attendance-selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy attendance_selfies_owner_update
on storage.objects for update to authenticated
using (
  bucket_id = 'attendance-selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
)
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

create policy attendance_selfies_admin_all
on storage.objects for all to authenticated
using (
  bucket_id = 'attendance-selfies'
  and public.is_admin()
)
with check (
  bucket_id = 'attendance-selfies'
  and public.is_admin()
);

comment on column public.attendance_records.check_in_selfie_url is
  'Storage object path in attendance-selfies (not a permanent signed/public URL).';
