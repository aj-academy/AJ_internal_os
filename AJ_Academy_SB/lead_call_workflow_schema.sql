-- Lead call workflow — call sessions, live lock, follow-up extras, activity links.
-- Safe to re-run. Does NOT drop or rename existing tables/columns.
-- Run after: employee_lead_management_schema.sql, employee_student_master_rls.sql, crm_owner_isolation.sql

-- =============================================================================
-- 1) Summary fields on clients (nullable; existing rows unchanged)
-- =============================================================================

alter table public.clients
  add column if not exists current_call_employee_id uuid references public.profiles (id) on delete set null,
  add column if not exists current_call_started_at timestamptz,
  add column if not exists current_call_session_id uuid,
  add column if not exists last_call_outcome text,
  add column if not exists total_call_attempts integer not null default 0,
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists next_follow_up_employee_id uuid references public.profiles (id) on delete set null;

create index if not exists clients_current_call_employee_id_idx
  on public.clients (current_call_employee_id)
  where current_call_employee_id is not null;

create index if not exists clients_next_follow_up_at_idx
  on public.clients (next_follow_up_at)
  where next_follow_up_at is not null;

create index if not exists clients_last_call_outcome_idx
  on public.clients (last_call_outcome)
  where last_call_outcome is not null;

-- =============================================================================
-- 2) lead_call_sessions
-- =============================================================================

create table if not exists public.lead_call_sessions (
  id uuid primary key default gen_random_uuid (),
  lead_id uuid not null references public.clients (id) on delete cascade,
  employee_id uuid not null references public.profiles (id),
  employee_name text,
  phone_number text not null,
  started_at timestamptz not null default now (),
  ended_at timestamptz,
  approximate_duration_seconds integer,
  session_status text not null default 'initiated'
    check (session_status in ('initiated', 'outcome_pending', 'completed', 'cancelled', 'stale')),
  call_outcome text,
  notes text,
  next_action text,
  lead_stage_at_start text,
  lead_stage_after text,
  source_page text,
  override_by uuid references public.profiles (id),
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index if not exists lead_call_sessions_lead_id_idx on public.lead_call_sessions (lead_id);
create index if not exists lead_call_sessions_employee_id_idx on public.lead_call_sessions (employee_id);
create index if not exists lead_call_sessions_status_idx on public.lead_call_sessions (session_status);
create index if not exists lead_call_sessions_started_at_idx on public.lead_call_sessions (started_at desc);

-- At most one active/pending session per lead
create unique index if not exists lead_call_sessions_one_active_per_lead_idx
  on public.lead_call_sessions (lead_id)
  where session_status in ('initiated', 'outcome_pending');

create or replace function public.lead_call_sessions_set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lead_call_sessions_set_updated_at_trigger on public.lead_call_sessions;
create trigger lead_call_sessions_set_updated_at_trigger
before update on public.lead_call_sessions
for each row
execute function public.lead_call_sessions_set_updated_at ();

-- FK from clients.current_call_session_id (added after table exists)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_current_call_session_id_fkey'
  ) then
    alter table public.clients
      add constraint clients_current_call_session_id_fkey
      foreign key (current_call_session_id) references public.lead_call_sessions (id) on delete set null;
  end if;
exception
  when duplicate_object then null;
end $$;

-- =============================================================================
-- 3) Extend lead_followups (additive only)
-- =============================================================================

alter table public.lead_followups
  add column if not exists assigned_employee_id uuid references public.profiles (id) on delete set null,
  add column if not exists reason text,
  add column if not exists priority text,
  add column if not exists parent_follow_up_id uuid references public.lead_followups (id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists outcome text,
  add column if not exists call_session_id uuid references public.lead_call_sessions (id) on delete set null;

create index if not exists lead_followups_assigned_employee_id_idx
  on public.lead_followups (assigned_employee_id)
  where assigned_employee_id is not null;

create index if not exists lead_followups_call_session_id_idx
  on public.lead_followups (call_session_id)
  where call_session_id is not null;

-- =============================================================================
-- 4) Extend lead_activities (additive only)
-- =============================================================================

alter table public.lead_activities
  add column if not exists call_session_id uuid references public.lead_call_sessions (id) on delete set null,
  add column if not exists follow_up_id uuid references public.lead_followups (id) on delete set null,
  add column if not exists title text;

create index if not exists lead_activities_call_session_id_idx
  on public.lead_activities (call_session_id)
  where call_session_id is not null;

create index if not exists lead_activities_follow_up_id_idx
  on public.lead_activities (follow_up_id)
  where follow_up_id is not null;

-- =============================================================================
-- 5) Helpers: staff role + assignment check
-- =============================================================================

create or replace function public.lead_call_actor_is_admin ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select lower(coalesce(role, '')) in ('admin', 'super_admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.lead_call_can_access_lead (p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.lead_call_actor_is_admin ()
    or exists (
      select 1 from public.clients c
      where c.id = p_lead_id and c.assigned_to = auth.uid ()
    )
    or (
      to_regclass('public.employee_crm_pins') is not null
      and exists (
        select 1 from public.employee_crm_pins p
        where p.entity_type = 'lead' and p.entity_id = p_lead_id and p.user_id = auth.uid ()
      )
    );
$$;

revoke all on function public.lead_call_actor_is_admin () from public;
revoke all on function public.lead_call_can_access_lead (uuid) from public;
grant execute on function public.lead_call_actor_is_admin () to authenticated;
grant execute on function public.lead_call_can_access_lead (uuid) to authenticated;

-- =============================================================================
-- 6) Atomic start call (server uses service role OR authenticated via RPC)
-- =============================================================================

create or replace function public.start_lead_call_session (
  p_lead_id uuid,
  p_source_page text default 'student_master',
  p_admin_override boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid ();
  v_is_admin boolean;
  v_lead public.clients%rowtype;
  v_owner_name text;
  v_actor_name text;
  v_active public.lead_call_sessions%rowtype;
  v_phone text;
  v_session_id uuid;
  v_now timestamptz := now ();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated.', 'code', 'unauthenticated');
  end if;

  v_is_admin := public.lead_call_actor_is_admin ();

  select * into v_lead from public.clients where id = p_lead_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Lead not found.', 'code', 'not_found');
  end if;

  -- Assignment gate (pins allowed for contact; same as app canContactLead)
  if not v_is_admin
     and v_lead.assigned_to is distinct from v_uid
     and not (
       to_regclass('public.employee_crm_pins') is not null
       and exists (
         select 1 from public.employee_crm_pins p
         where p.entity_type = 'lead' and p.entity_id = p_lead_id and p.user_id = v_uid
       )
     ) then
    select coalesce(nullif(trim(full_name), ''), email, 'another employee')
      into v_owner_name
    from public.profiles
    where id = v_lead.assigned_to;
    return jsonb_build_object(
      'ok', false,
      'code', 'not_assigned',
      'error', format(
        'This lead is assigned to %s. Contact the admin if reassignment is required.',
        coalesce(v_owner_name, 'another employee')
      ),
      'assigned_to', v_lead.assigned_to,
      'assigned_name', v_owner_name
    );
  end if;

  -- Mark stale locks older than 30 minutes
  update public.lead_call_sessions s
  set session_status = 'stale',
      ended_at = coalesce(s.ended_at, v_now),
      updated_at = v_now
  where s.lead_id = p_lead_id
    and s.session_status in ('initiated', 'outcome_pending')
    and s.started_at < (v_now - interval '30 minutes');

  -- Clear live lock if pointing at stale/closed session
  if v_lead.current_call_session_id is not null then
    if not exists (
      select 1 from public.lead_call_sessions s
      where s.id = v_lead.current_call_session_id
        and s.session_status in ('initiated', 'outcome_pending')
    ) then
      update public.clients
      set current_call_employee_id = null,
          current_call_started_at = null,
          current_call_session_id = null
      where id = p_lead_id;
      select * into v_lead from public.clients where id = p_lead_id;
    end if;
  end if;

  select * into v_active
  from public.lead_call_sessions
  where lead_id = p_lead_id
    and session_status in ('initiated', 'outcome_pending')
  order by started_at desc
  limit 1;

  if found then
    if v_active.employee_id = v_uid then
      -- Resume own open session
      update public.lead_call_sessions
      set session_status = 'outcome_pending', updated_at = v_now
      where id = v_active.id and session_status = 'initiated';

      update public.clients
      set current_call_employee_id = v_uid,
          current_call_started_at = v_active.started_at,
          current_call_session_id = v_active.id
      where id = p_lead_id;

      return jsonb_build_object(
        'ok', true,
        'resumed', true,
        'session_id', v_active.id,
        'phone_number', v_active.phone_number,
        'started_at', v_active.started_at,
        'session_status', 'outcome_pending'
      );
    end if;

    if not (v_is_admin and p_admin_override) then
      select coalesce(nullif(trim(full_name), ''), email, 'Another employee')
        into v_owner_name
      from public.profiles where id = v_active.employee_id;
      return jsonb_build_object(
        'ok', false,
        'code', 'active_call',
        'error', format(
          '%s started calling this lead at %s.',
          coalesce(v_owner_name, 'Another employee'),
          to_char(timezone('Asia/Kolkata', v_active.started_at), 'DD Mon YYYY, HH12:MI AM')
        ),
        'active_employee_id', v_active.employee_id,
        'active_employee_name', v_owner_name,
        'active_started_at', v_active.started_at,
        'active_session_id', v_active.id,
        'can_override', v_is_admin
      );
    end if;

    -- Admin override: close prior active session
    update public.lead_call_sessions
    set session_status = 'cancelled',
        ended_at = v_now,
        notes = coalesce(notes, '') || E'\n[Admin override cancelled prior session]',
        override_by = v_uid,
        updated_at = v_now
    where id = v_active.id;
  end if;

  v_phone := nullif(trim(coalesce(v_lead.phone, '')), '');
  if v_phone is null then
    return jsonb_build_object('ok', false, 'error', 'No mobile number on this student.', 'code', 'no_phone');
  end if;

  select coalesce(nullif(trim(full_name), ''), email, 'Staff')
    into v_actor_name
  from public.profiles where id = v_uid;

  insert into public.lead_call_sessions (
    lead_id, employee_id, employee_name, phone_number, started_at,
    session_status, lead_stage_at_start, source_page, override_by
  ) values (
    p_lead_id, v_uid, v_actor_name, v_phone, v_now,
    'initiated',
    coalesce(v_lead.lead_stage, v_lead.status),
    coalesce(nullif(trim(p_source_page), ''), 'student_master'),
    case when p_admin_override then v_uid else null end
  )
  returning id into v_session_id;

  update public.clients
  set current_call_employee_id = v_uid,
      current_call_started_at = v_now,
      current_call_session_id = v_session_id,
      phone_called = true,
      phone_called_at = coalesce(phone_called_at, v_now),
      total_call_attempts = coalesce(total_call_attempts, 0) + 1
  where id = p_lead_id;

  insert into public.lead_activities (
    client_id, activity_type, title, notes, created_by, call_session_id, new_value
  ) values (
    p_lead_id,
    'Call initiated',
    'Call initiated',
    format('Called %s', v_phone),
    v_uid,
    v_session_id,
    v_actor_name
  );

  -- Move to outcome_pending immediately after dialer handoff is expected
  update public.lead_call_sessions
  set session_status = 'outcome_pending', updated_at = v_now
  where id = v_session_id;

  return jsonb_build_object(
    'ok', true,
    'resumed', false,
    'session_id', v_session_id,
    'phone_number', v_phone,
    'started_at', v_now,
    'session_status', 'outcome_pending',
    'employee_name', v_actor_name,
    'lead_name', coalesce(nullif(trim(v_lead.lead_name), ''), nullif(trim(v_lead.name), ''), 'Lead'),
    'total_call_attempts', coalesce(v_lead.total_call_attempts, 0) + 1
  );
end;
$$;

revoke all on function public.start_lead_call_session (uuid, text, boolean) from public;
grant execute on function public.start_lead_call_session (uuid, text, boolean) to authenticated;

-- Mark stale sessions (callable by cron or app)
create or replace function public.mark_stale_lead_call_sessions ()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with stale as (
    update public.lead_call_sessions
    set session_status = 'stale',
        ended_at = coalesce(ended_at, now ()),
        updated_at = now ()
    where session_status in ('initiated', 'outcome_pending')
      and started_at < (now () - interval '30 minutes')
    returning id, lead_id
  ),
  cleared as (
    update public.clients c
    set current_call_employee_id = null,
        current_call_started_at = null,
        current_call_session_id = null
    from stale s
    where c.id = s.lead_id
      and c.current_call_session_id = s.id
    returning c.id
  )
  select count(*)::integer into n from stale;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.mark_stale_lead_call_sessions () from public;
grant execute on function public.mark_stale_lead_call_sessions () to authenticated;

-- =============================================================================
-- 7) RLS
-- =============================================================================

alter table public.lead_call_sessions enable row level security;

drop policy if exists lead_call_sessions_select on public.lead_call_sessions;
create policy lead_call_sessions_select on public.lead_call_sessions
for select to authenticated
using (
  public.lead_call_actor_is_admin ()
  or employee_id = auth.uid ()
  or public.lead_call_can_access_lead (lead_id)
);

drop policy if exists lead_call_sessions_insert on public.lead_call_sessions;
create policy lead_call_sessions_insert on public.lead_call_sessions
for insert to authenticated
with check (
  employee_id = auth.uid ()
  and public.lead_call_can_access_lead (lead_id)
);

drop policy if exists lead_call_sessions_update on public.lead_call_sessions;
create policy lead_call_sessions_update on public.lead_call_sessions
for update to authenticated
using (
  public.lead_call_actor_is_admin ()
  or (employee_id = auth.uid () and session_status in ('initiated', 'outcome_pending', 'stale'))
)
with check (
  public.lead_call_actor_is_admin ()
  or employee_id = auth.uid ()
);

-- Employees must not delete call history
drop policy if exists lead_call_sessions_delete_admin on public.lead_call_sessions;
create policy lead_call_sessions_delete_admin on public.lead_call_sessions
for delete to authenticated
using (public.lead_call_actor_is_admin ());

grant select, insert, update on public.lead_call_sessions to authenticated;
grant delete on public.lead_call_sessions to authenticated;

-- Realtime (optional — ignore if publication missing)
do $$
begin
  alter publication supabase_realtime add table public.lead_call_sessions;
exception
  when undefined_object then null;
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
