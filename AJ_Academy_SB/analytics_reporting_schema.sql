-- AJ OS — Reports & Analytics support (indexes + EOD tracker columns)
-- Safe to re-run. Run after attendance_module.sql, lead_call_workflow_schema.sql,
-- task_schema.sql, student lead / CRM schemas.
-- Does NOT invent KPI facts — those come from existing CRM/attendance/task tables.

-- ---------------------------------------------------------------------------
-- End of Day tracker columns on existing work_summaries
-- ---------------------------------------------------------------------------
alter table public.work_summaries
  add column if not exists support_required text,
  add column if not exists additional_remarks text,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz;

-- Deduplicate work_summaries before unique index (keep newest row per employee/day)
delete from public.work_summaries w
using public.work_summaries newer
where w.employee_id is not null
  and w.summary_date is not null
  and w.employee_id = newer.employee_id
  and w.summary_date = newer.summary_date
  and w.created_at < newer.created_at;

create unique index if not exists work_summaries_employee_date_uidx
  on public.work_summaries (employee_id, summary_date);

create index if not exists work_summaries_summary_date_idx
  on public.work_summaries (summary_date desc);

create index if not exists work_summaries_status_idx
  on public.work_summaries (status);

-- ---------------------------------------------------------------------------
-- Query indexes for analytics (partial / covering where helpful)
-- ---------------------------------------------------------------------------
create index if not exists lead_call_sessions_employee_started_idx
  on public.lead_call_sessions (employee_id, started_at desc);

create index if not exists lead_call_sessions_outcome_started_idx
  on public.lead_call_sessions (call_outcome, started_at desc)
  where call_outcome is not null;

create index if not exists lead_activities_created_by_created_at_idx
  on public.lead_activities (created_by, created_at desc);

create index if not exists lead_followups_assignee_date_status_idx
  on public.lead_followups (assigned_employee_id, follow_up_date, status);

create index if not exists clients_assigned_follow_up_idx
  on public.clients (assigned_to, follow_up_date)
  where assigned_to is not null;

create index if not exists clients_assigned_admission_idx
  on public.clients (assigned_to, admission_status)
  where assigned_to is not null;

create index if not exists clients_source_status_idx
  on public.clients (source, status);

create index if not exists tasks_assigned_status_due_idx
  on public.tasks (assigned_to, status, due_date);

create index if not exists attendance_records_employee_date_idx
  on public.attendance_records (employee_id, attendance_date desc);

create index if not exists profiles_role_department_status_idx
  on public.profiles (role, department, status);

-- ---------------------------------------------------------------------------
-- Optional helper: day range productivity snapshot (read-only RPC for admins)
-- Returns one row per employee for the requested date window.
-- ---------------------------------------------------------------------------
create or replace function public.analytics_employee_day_rollups(
  p_from date,
  p_to date,
  p_employee_id uuid default null
)
returns table (
  employee_id uuid,
  calls_attempted bigint,
  calls_connected bigint,
  tasks_completed bigint,
  tasks_pending bigint,
  crm_updates bigint,
  followups_pending bigint,
  admissions bigint,
  revenue numeric,
  present_days bigint,
  working_minutes bigint
)
language sql
security definer
set search_path = public
as $$
  with emps as (
    select p.id
    from public.profiles p
    where p.role = 'employee'
      and coalesce(p.status, 'active') = 'active'
      and (p_employee_id is null or p.id = p_employee_id)
  ),
  calls as (
    select s.employee_id,
      count(*)::bigint as calls_attempted,
      count(*) filter (
        where s.call_outcome is not null
          and s.call_outcome ilike 'Connected%'
      )::bigint as calls_connected
    from public.lead_call_sessions s
    where s.started_at::date between p_from and p_to
      and (p_employee_id is null or s.employee_id = p_employee_id)
    group by s.employee_id
  ),
  task_stats as (
    select t.assigned_to as employee_id,
      count(*) filter (where t.status = 'Completed')::bigint as tasks_completed,
      count(*) filter (where t.status is distinct from 'Completed')::bigint as tasks_pending
    from public.tasks t
    where coalesce(t.updated_at, t.created_at)::date between p_from and p_to
      and t.assigned_to is not null
      and (p_employee_id is null or t.assigned_to = p_employee_id)
    group by t.assigned_to
  ),
  crm as (
    select a.created_by as employee_id,
      count(*)::bigint as crm_updates
    from public.lead_activities a
    where a.created_at::date between p_from and p_to
      and a.created_by is not null
      and (p_employee_id is null or a.created_by = p_employee_id)
    group by a.created_by
  ),
  fus as (
    select coalesce(f.assigned_employee_id, c.assigned_to) as employee_id,
      count(*) filter (
        where coalesce(f.status, 'Pending') in ('Pending', 'Missed')
          or (f.follow_up_date < current_date and coalesce(f.status, 'Pending') = 'Pending')
      )::bigint as followups_pending
    from public.lead_followups f
    left join public.clients c on c.id = f.client_id
    where f.follow_up_date between p_from and p_to
      and (p_employee_id is null
        or f.assigned_employee_id = p_employee_id
        or c.assigned_to = p_employee_id)
    group by 1
  ),
  admissions as (
    select c.assigned_to as employee_id,
      count(*) filter (
        where coalesce(c.admission_status, '') ilike '%Admit%'
          or coalesce(c.status, '') = 'Admitted'
      )::bigint as admissions,
      coalesce(sum(c.final_fee) filter (
        where coalesce(c.admission_status, '') ilike '%Admit%'
          or coalesce(c.status, '') = 'Admitted'
          or coalesce(c.payment_status, '') in ('Paid', 'Partial')
      ), 0)::numeric as revenue
    from public.clients c
    where c.assigned_to is not null
      and coalesce(c.updated_at, c.created_at)::date between p_from and p_to
      and (p_employee_id is null or c.assigned_to = p_employee_id)
    group by c.assigned_to
  ),
  att as (
    select r.employee_id,
      count(*) filter (
        where lower(coalesce(r.status, '')) in ('present', 'completed', 'late')
      )::bigint as present_days,
      coalesce(sum(r.total_working_minutes), 0)::bigint as working_minutes
    from public.attendance_records r
    where r.attendance_date between p_from and p_to
      and (p_employee_id is null or r.employee_id = p_employee_id)
    group by r.employee_id
  )
  select
    e.id as employee_id,
    coalesce(c.calls_attempted, 0),
    coalesce(c.calls_connected, 0),
    coalesce(t.tasks_completed, 0),
    coalesce(t.tasks_pending, 0),
    coalesce(crm.crm_updates, 0),
    coalesce(f.followups_pending, 0),
    coalesce(a.admissions, 0),
    coalesce(a.revenue, 0),
    coalesce(att.present_days, 0),
    coalesce(att.working_minutes, 0)
  from emps e
  left join calls c on c.employee_id = e.id
  left join task_stats t on t.employee_id = e.id
  left join crm on crm.employee_id = e.id
  left join fus f on f.employee_id = e.id
  left join admissions a on a.employee_id = e.id
  left join att on att.employee_id = e.id
  order by coalesce(c.calls_attempted, 0) desc, e.id;
$$;

revoke all on function public.analytics_employee_day_rollups(date, date, uuid) from public;
grant execute on function public.analytics_employee_day_rollups(date, date, uuid) to authenticated;

comment on function public.analytics_employee_day_rollups is
  'AJ OS analytics rollup for Reports & Analytics. Admins use via service/authenticated RLS; employees should pass their own p_employee_id.';
