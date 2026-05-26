-- AJ Academy — selfie check-in for freelancers
-- Run after attendance_module.sql
-- Safe to re-run: drops existing storage policies before recreating them.

alter table public.attendance_records
  add column if not exists check_in_selfie_url text;

-- Storage bucket for check-in selfies (public read for <img> thumbnails)
insert into storage.buckets (id, name, public)
values ('attendance-selfies', 'attendance-selfies', true)
on conflict (id) do update set public = excluded.public;

-- Recreate policies (ignore error if you only need column + bucket: run blocks separately)
drop policy if exists "attendance_selfies_insert_own" on storage.objects;
drop policy if exists "attendance_selfies_update_own" on storage.objects;
drop policy if exists "attendance_selfies_select_authenticated" on storage.objects;
drop policy if exists "attendance_selfies_admin_all" on storage.objects;

-- Users upload only under their user id prefix
create policy "attendance_selfies_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attendance-selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "attendance_selfies_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'attendance-selfies'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "attendance_selfies_select_authenticated"
on storage.objects for select to authenticated
using (bucket_id = 'attendance-selfies');

create policy "attendance_selfies_admin_all"
on storage.objects for all to authenticated
using (
  bucket_id = 'attendance-selfies'
  and public.is_admin()
)
with check (
  bucket_id = 'attendance-selfies'
  and public.is_admin()
);
