-- Run in Supabase SQL Editor if Admin Attendance → Summary shows:
--   column work_summaries.manager_remarks does not exist
--
-- Your work_summaries table was likely created before this column existed.
-- CREATE TABLE IF NOT EXISTS does not add new columns to an existing table.

alter table public.work_summaries add column if not exists manager_remarks text;
