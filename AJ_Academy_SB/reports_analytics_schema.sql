-- Reports & Analytics — indexes + views + RPC helpers for live report queries.
-- Safe to re-run. Does NOT drop data.
--
-- Run AFTER:
--   schema.sql, attendance_module.sql, task_schema.sql, project_master_schema.sql
--   lead_call_workflow_schema.sql (for calls)
--   student_lead_master_aux_schema.sql (for followups/activities)
--   student_master_columns_patch.sql (for admission/fee columns)
--   finance_schema.sql (optional — finance KPIs)
--
-- If optional tables are missing, corresponding views are skipped (see notices).

-- =============================================================================
-- Indexes (idempotent) for report date / employee filters
-- =============================================================================

create index if not exists attendance_records_date_emp_idx
  on public.attendance_records (attendance_date desc, employee_id);

create index if not exists tasks_assigned_status_idx
  on public.tasks (assigned_to, status);

create index if not exists clients_source_idx
  on public.clients (source)
  where source is not null;

create index if not exists clients_assigned_to_idx
  on public.clients (assigned_to)
  where assigned_to is not null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'admission_status'
  ) then
    execute 'create index if not exists clients_admission_status_idx on public.clients (admission_status) where admission_status is not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'interested_program'
  ) then
    execute 'create index if not exists clients_interested_program_idx on public.clients (interested_program) where interested_program is not null';
  end if;
  if to_regclass('public.finance_transactions') is not null then
    execute 'create index if not exists finance_transactions_date_type_idx on public.finance_transactions (transaction_date desc, transaction_type)';
  end if;
end $$;

-- =============================================================================
-- Views (created only when base tables exist)
-- =============================================================================

do $$
begin
  if to_regclass('public.lead_call_sessions') is not null then
    execute $v$
      create or replace view public.v_report_call_sessions as
      select
        s.id,
        s.lead_id,
        s.employee_id,
        coalesce(s.employee_name, p.full_name, p.email) as employee_name,
        coalesce(c.name, c.company_name) as lead_name,
        c.source as lead_source,
        s.phone_number,
        s.started_at,
        s.ended_at,
        s.approximate_duration_seconds,
        case
          when s.approximate_duration_seconds is null then null
          else round(s.approximate_duration_seconds / 60.0, 1)
        end as approximate_duration_minutes,
        s.session_status,
        s.call_outcome,
        s.notes,
        s.next_action,
        s.lead_stage_after,
        s.created_at
      from public.lead_call_sessions s
      left join public.profiles p on p.id = s.employee_id
      left join public.clients c on c.id = s.lead_id;
    $v$;
    raise notice 'Created view v_report_call_sessions';
  else
    raise notice 'SKIP v_report_call_sessions — missing table lead_call_sessions (run lead_call_workflow_schema.sql)';
  end if;
end $$;

do $$
begin
  if to_regclass('public.lead_followups') is not null then
    execute $v$
      create or replace view public.v_report_followups as
      select
        f.id,
        f.client_id,
        coalesce(c.name, c.company_name) as lead_name,
        c.source as lead_source,
        f.follow_up_date,
        f.follow_up_time,
        f.follow_up_type,
        f.status,
        f.notes,
        f.reason,
        f.priority,
        f.outcome,
        f.completed_at,
        f.assigned_employee_id,
        coalesce(ap.full_name, ap.email) as assigned_employee_name,
        f.created_by,
        f.call_session_id,
        f.created_at,
        f.updated_at,
        case
          when lower(coalesce(f.status, '')) in ('completed', 'done', 'closed') then 'completed'
          when lower(coalesce(f.status, '')) in ('rescheduled', 'reschedule') then 'rescheduled'
          when lower(coalesce(f.status, '')) in ('missed', 'no_show', 'no-show') then 'missed'
          when f.follow_up_date is not null and f.follow_up_date < current_date
            and lower(coalesce(f.status, 'pending')) not in ('completed', 'done', 'closed', 'cancelled')
            then 'overdue'
          when f.follow_up_date = current_date then 'today'
          when f.follow_up_date > current_date then 'upcoming'
          else 'pending'
        end as followup_bucket
      from public.lead_followups f
      left join public.clients c on c.id = f.client_id
      left join public.profiles ap on ap.id = f.assigned_employee_id;
    $v$;
    raise notice 'Created view v_report_followups';
  else
    raise notice 'SKIP v_report_followups — missing table lead_followups (run student_lead_master_aux_schema.sql)';
  end if;
end $$;

do $$
begin
  if to_regclass('public.lead_activities') is not null then
    execute $v$
      create or replace view public.v_report_lead_activities as
      select
        a.id,
        a.client_id,
        coalesce(c.name, c.company_name) as lead_name,
        a.activity_type,
        a.title,
        a.notes,
        a.old_value,
        a.new_value,
        a.created_by,
        coalesce(p.full_name, p.email) as actor_name,
        a.call_session_id,
        a.follow_up_id,
        a.created_at
      from public.lead_activities a
      left join public.clients c on c.id = a.client_id
      left join public.profiles p on p.id = a.created_by;
    $v$;
    raise notice 'Created view v_report_lead_activities';
  else
    raise notice 'SKIP v_report_lead_activities — missing table lead_activities';
  end if;
exception
  when undefined_column then
    -- title / call_session_id may be missing on older installs
    execute $v$
      create or replace view public.v_report_lead_activities as
      select
        a.id,
        a.client_id,
        coalesce(c.name, c.company_name) as lead_name,
        a.activity_type,
        null::text as title,
        a.notes,
        a.old_value,
        a.new_value,
        a.created_by,
        coalesce(p.full_name, p.email) as actor_name,
        null::uuid as call_session_id,
        null::uuid as follow_up_id,
        a.created_at
      from public.lead_activities a
      left join public.clients c on c.id = a.client_id
      left join public.profiles p on p.id = a.created_by;
    $v$;
    raise notice 'Created view v_report_lead_activities (legacy columns)';
end $$;

-- Admission / lead revenue slice (requires fee columns)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'admission_status'
  ) then
    execute $v$
      create or replace view public.v_report_admissions as
      select
        c.id as client_id,
        coalesce(c.name, c.company_name) as lead_name,
        c.source,
        c.status,
        c.admission_status,
        c.lead_stage,
        c.interested_program,
        c.service_interest,
        c.fee_quoted,
        c.final_fee,
        c.payment_status,
        c.assigned_to,
        coalesce(p.full_name, p.email) as assigned_employee_name,
        c.converted_at,
        c.created_at,
        case
          when lower(coalesce(c.admission_status, '')) in ('cancelled', 'canceled', 'withdrawn') then 'cancelled'
          when lower(coalesce(c.admission_status, '')) in ('admitted', 'enrolled', 'joined')
            or lower(coalesce(c.status, '')) = 'converted'
            or c.converted_at is not null
            then 'admitted'
          when lower(coalesce(c.payment_status, '')) in ('pending', 'partial', 'due') then 'pending_fees'
          else 'open'
        end as admission_bucket
      from public.clients c
      left join public.profiles p on p.id = c.assigned_to;
    $v$;
    raise notice 'Created view v_report_admissions';
  else
    raise notice 'SKIP v_report_admissions — missing clients.admission_status (run student_master_columns_patch.sql)';
  end if;
end $$;

-- =============================================================================
-- RPC: report schema probe (what is available)
-- =============================================================================

create or replace function public.reports_schema_status ()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb := '{}'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  result := jsonb_build_object(
    'tables', jsonb_build_object(
      'profiles', to_regclass('public.profiles') is not null,
      'clients', to_regclass('public.clients') is not null,
      'tasks', to_regclass('public.tasks') is not null,
      'attendance_records', to_regclass('public.attendance_records') is not null,
      'lead_call_sessions', to_regclass('public.lead_call_sessions') is not null,
      'lead_followups', to_regclass('public.lead_followups') is not null,
      'lead_activities', to_regclass('public.lead_activities') is not null,
      'finance_transactions', to_regclass('public.finance_transactions') is not null,
      'project_payments', to_regclass('public.project_payments') is not null,
      'task_activities', to_regclass('public.task_activities') is not null,
      'audit_logs', to_regclass('public.audit_logs') is not null
    ),
    'columns', jsonb_build_object(
      'clients.admission_status', exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'clients' and column_name = 'admission_status'
      ),
      'clients.final_fee', exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'clients' and column_name = 'final_fee'
      ),
      'clients.interested_program', exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'clients' and column_name = 'interested_program'
      ),
      'lead_call_sessions.approximate_duration_seconds', exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'lead_call_sessions'
          and column_name = 'approximate_duration_seconds'
      ),
      'profiles.department', exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'department'
      ),
      'org_branch', false
    ),
    'views', jsonb_build_object(
      'v_report_call_sessions', to_regclass('public.v_report_call_sessions') is not null,
      'v_report_followups', to_regclass('public.v_report_followups') is not null,
      'v_report_lead_activities', to_regclass('public.v_report_lead_activities') is not null,
      'v_report_admissions', to_regclass('public.v_report_admissions') is not null
    ),
    'notes', jsonb_build_array(
      'Call duration is approximate_duration_seconds only (estimate from session timestamps / workflow). Exact carrier duration is not stored.',
      'No organizational branch column exists on profiles/clients — Branch filter unavailable.',
      'Student fee columns (final_fee) are not auto-posted to finance_transactions.'
    )
  );

  return result;
end;
$$;

revoke all on function public.reports_schema_status () from public;
grant execute on function public.reports_schema_status () to authenticated;

comment on function public.reports_schema_status is
  'Admin-only probe of tables/columns/views required by Reports & Analytics.';
