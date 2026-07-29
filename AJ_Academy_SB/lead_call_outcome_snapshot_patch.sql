-- Call outcome snapshot history — store full form fields per completed session.
-- Safe to re-run. Run after lead_call_workflow_schema.sql

alter table public.lead_call_sessions
  add column if not exists outcome_snapshot jsonb;

comment on column public.lead_call_sessions.outcome_snapshot is
  'Full call-outcome form snapshot (status, stage, priority, follow-up, objections, flags) for history UI.';

create index if not exists lead_call_sessions_outcome_snapshot_gin_idx
  on public.lead_call_sessions using gin (outcome_snapshot)
  where outcome_snapshot is not null;
