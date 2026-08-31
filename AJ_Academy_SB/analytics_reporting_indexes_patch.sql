-- AJ OS - Reports & Analytics index patch
--
-- Run AFTER analytics_reporting_schema.sql. Safe to re-run.
--
-- Additive only: creates indexes, nothing else. No table, column, policy or row
-- is altered, so this cannot affect existing business data or RLS.
--
-- Why a patch rather than edits to analytics_reporting_schema.sql: that file
-- already indexes calls, lead activities, follow-ups, clients, tasks,
-- attendance and profiles. The access patterns below were added to the reports
-- later (task completion events and the College Visits dialer) and were never
-- indexed, so they are the sequential scans left in the module.
--
-- Each index mirrors the exact predicate order used by
-- AJ_Academy_OS/lib/analytics/runAnalyticsQuery.ts. If a query there changes,
-- re-check the matching index here.

-- ---------------------------------------------------------------------------
-- 1. Task completion events
-- ---------------------------------------------------------------------------
-- Task Completion, and Daily Employee Report -> Tasks Done, both read
-- task_activities filtered by activity_type = 'task_completed' over a
-- created_at range. Employee scoping happens after the fetch, so the index
-- leads with activity_type and created_at, and carries actor_id so the common
-- per-employee grouping can be served from the index.
create index if not exists task_activities_type_created_actor_idx
  on public.task_activities (activity_type, created_at desc, actor_id);

-- Employee Timeline reads one actor's events newest-first.
create index if not exists task_activities_actor_created_idx
  on public.task_activities (actor_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. College Visits dialer / activity feed
-- ---------------------------------------------------------------------------
-- Call Activity counts College Visits 'Phone Call' logs alongside Student
-- Master call sessions. Partial index because Phone Call is a small slice of
-- the table and every call query filters on it.
create index if not exists college_visit_activities_phone_call_idx
  on public.college_visit_activities (created_at desc, created_by)
  where activity_type = 'Phone Call';

-- The CRM-activity and Timeline reads take all activity types for a set of
-- users over a date range.
create index if not exists college_visit_activities_creator_created_idx
  on public.college_visit_activities (created_by, created_at desc);

-- Used by the type breakdown and by the WhatsApp / Email message counts.
create index if not exists college_visit_activities_type_created_idx
  on public.college_visit_activities (activity_type, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Admissions / revenue in a date range
-- ---------------------------------------------------------------------------
-- Admission and Revenue reports select converted leads within the range.
-- Partial index keeps it to rows that actually converted.
create index if not exists clients_converted_at_idx
  on public.clients (converted_at desc, assigned_to)
  where converted_at is not null;

-- ---------------------------------------------------------------------------
-- 4. Verify
-- ---------------------------------------------------------------------------
-- Expect 6 rows.
select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'task_activities_type_created_actor_idx',
    'task_activities_actor_created_idx',
    'college_visit_activities_phone_call_idx',
    'college_visit_activities_creator_created_idx',
    'college_visit_activities_type_created_idx',
    'clients_converted_at_idx'
  )
order by indexname;
