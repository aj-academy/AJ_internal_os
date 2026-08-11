-- Additive GPS accuracy columns for attendance_records.
-- Safe to re-run. Does not rewrite existing rows.
-- Rollback:
--   alter table public.attendance_records drop column if exists check_in_accuracy_meters;
--   alter table public.attendance_records drop column if exists check_out_accuracy_meters;

alter table public.attendance_records
  add column if not exists check_in_accuracy_meters numeric,
  add column if not exists check_out_accuracy_meters numeric;

comment on column public.attendance_records.check_in_accuracy_meters is
  'Browser GeolocationAccuracy (meters) at check-in; nullable.';
comment on column public.attendance_records.check_out_accuracy_meters is
  'Browser GeolocationAccuracy (meters) at check-out; nullable.';
