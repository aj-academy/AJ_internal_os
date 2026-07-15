-- =============================================================================
-- AJ Academy OS — Reminders & Calendar (ADDITIVE ONLY)
-- File: aj_reminders_schema.sql
-- Safe to re-run. Does NOT modify, drop, truncate, or alter any existing tables,
-- columns, policies, triggers, or storage objects outside this script.
-- Foreign keys to public.profiles use ON DELETE SET NULL / CASCADE only on
-- reminder-owned rows — never CASCADE into Student Master / College / Tasks / Finance.
-- Review before running in Supabase SQL Editor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers (new names only — do not replace existing is_admin / is_employee)
-- ---------------------------------------------------------------------------
create or replace function public.aj_reminder_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) aj_reminders
-- ---------------------------------------------------------------------------
create table if not exists public.aj_reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  reminder_type text not null
    check (reminder_type in (
      'Meeting','Appointment','Call','Student Follow-up','College Follow-up',
      'Proposal Follow-up','Payment Follow-up','College Visit','Training Session',
      'Deadline','Personal Reminder','General Reminder'
    )),
  description text,
  reminder_date date not null,
  start_time time,
  end_time time,
  is_all_day boolean not null default false,
  priority text not null default 'Medium'
    check (priority in ('Low','Medium','High','Urgent')),
  status text not null default 'Scheduled'
    check (status in ('Scheduled','In Progress','Completed','Cancelled','Missed','Rescheduled')),
  location text,
  meeting_mode text
    check (meeting_mode is null or meeting_mode in (
      'In Person','Phone Call','Google Meet','Zoom','Microsoft Teams','Other'
    )),
  meeting_link text,
  related_module text
    check (related_module is null or related_module in (
      'Student Master','College Visits','Project Master','Task Assignment',
      'Finance & Expenses','Employee/User Master','General'
    )),
  -- Soft reference only — NO FK to clients / college_visits / tasks / finance
  related_record_id uuid,
  related_record_label text,
  recurrence_rule text not null default 'none'
    check (recurrence_rule in ('none','daily','weekday','weekly','monthly','yearly','custom')),
  recurrence_interval integer not null default 1 check (recurrence_interval >= 1),
  recurrence_weekdays integer[] default null,
  recurrence_end_date date,
  recurrence_end_count integer,
  recurrence_group_id uuid,
  recurrence_parent_id uuid,
  is_private boolean not null default false,
  sound_enabled boolean not null default true,
  push_enabled boolean not null default true,
  notify_offsets_minutes integer[] not null default array[0],
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  cancelled_at timestamptz,
  snooze_until timestamptz,
  constraint aj_reminders_time_ok check (
    is_all_day = true
    or start_time is not null
  ),
  constraint aj_reminders_end_after_start check (
    end_time is null or start_time is null or end_time >= start_time
  )
);

create index if not exists aj_reminders_date_idx on public.aj_reminders (reminder_date);
create index if not exists aj_reminders_status_idx on public.aj_reminders (status);
create index if not exists aj_reminders_created_by_idx on public.aj_reminders (created_by);
create index if not exists aj_reminders_group_idx on public.aj_reminders (recurrence_group_id);
create index if not exists aj_reminders_related_idx on public.aj_reminders (related_module, related_record_id);

drop trigger if exists aj_reminders_set_updated_at on public.aj_reminders;
create trigger aj_reminders_set_updated_at
before update on public.aj_reminders
for each row execute function public.aj_reminder_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) aj_reminder_assignees (participants + assignees)
-- ---------------------------------------------------------------------------
create table if not exists public.aj_reminder_assignees (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.aj_reminders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'assignee'
    check (role in ('assignee','participant')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (reminder_id, user_id, role)
);

create index if not exists aj_reminder_assignees_user_idx
  on public.aj_reminder_assignees (user_id);
create index if not exists aj_reminder_assignees_reminder_idx
  on public.aj_reminder_assignees (reminder_id);

-- ---------------------------------------------------------------------------
-- 3) aj_reminder_alerts (scheduled notification fire times)
-- ---------------------------------------------------------------------------
create table if not exists public.aj_reminder_alerts (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.aj_reminders (id) on delete cascade,
  fire_at timestamptz not null,
  channel text not null default 'in_app'
    check (channel in ('in_app','push','both')),
  offset_minutes integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending','processed','cancelled','failed')),
  idempotency_key text not null,
  processed_at timestamptz,
  error_message text,
  retry_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (idempotency_key)
);

create index if not exists aj_reminder_alerts_due_idx
  on public.aj_reminder_alerts (status, fire_at)
  where status = 'pending';
create index if not exists aj_reminder_alerts_reminder_idx
  on public.aj_reminder_alerts (reminder_id);

-- ---------------------------------------------------------------------------
-- 4) aj_reminder_notifications (delivered in-app alerts — isolated from in_app_notifications)
-- ---------------------------------------------------------------------------
create table if not exists public.aj_reminder_notifications (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.aj_reminders (id) on delete cascade,
  alert_id uuid references public.aj_reminder_alerts (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  link_path text,
  sound_played_at timestamptz,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (alert_id, user_id)
);

create index if not exists aj_reminder_notifications_user_unread_idx
  on public.aj_reminder_notifications (user_id, created_at desc)
  where dismissed_at is null;

-- ---------------------------------------------------------------------------
-- 5) aj_reminder_push_subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.aj_reminder_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (endpoint)
);

create index if not exists aj_reminder_push_subs_user_idx
  on public.aj_reminder_push_subscriptions (user_id)
  where is_active = true;

drop trigger if exists aj_reminder_push_subs_updated_at on public.aj_reminder_push_subscriptions;
create trigger aj_reminder_push_subs_updated_at
before update on public.aj_reminder_push_subscriptions
for each row execute function public.aj_reminder_set_updated_at();

-- ---------------------------------------------------------------------------
-- 6) aj_reminder_user_settings
-- ---------------------------------------------------------------------------
create table if not exists public.aj_reminder_user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  sound_enabled boolean not null default true,
  sound_volume integer not null default 80 check (sound_volume between 0 and 100),
  popup_enabled boolean not null default true,
  browser_notification_enabled boolean not null default false,
  push_enabled boolean not null default false,
  default_notify_offsets_minutes integer[] not null default array[15, 0],
  default_snooze_minutes integer not null default 10,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists aj_reminder_user_settings_updated_at on public.aj_reminder_user_settings;
create trigger aj_reminder_user_settings_updated_at
before update on public.aj_reminder_user_settings
for each row execute function public.aj_reminder_set_updated_at();

-- ---------------------------------------------------------------------------
-- 7) aj_reminder_activity_logs
-- ---------------------------------------------------------------------------
create table if not exists public.aj_reminder_activity_logs (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references public.aj_reminders (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists aj_reminder_activity_reminder_idx
  on public.aj_reminder_activity_logs (reminder_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Visibility helper (SECURITY DEFINER — does not alter existing role functions)
-- ---------------------------------------------------------------------------
create or replace function public.aj_reminder_user_can_access(p_reminder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.aj_reminders r
    where r.id = p_reminder_id
      and (
        public.is_admin()
        or r.created_by = auth.uid()
        or exists (
          select 1 from public.aj_reminder_assignees a
          where a.reminder_id = r.id and a.user_id = auth.uid()
        )
      )
  );
$$;

grant execute on function public.aj_reminder_user_can_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS — new tables only
-- ---------------------------------------------------------------------------
alter table public.aj_reminders enable row level security;
alter table public.aj_reminder_assignees enable row level security;
alter table public.aj_reminder_alerts enable row level security;
alter table public.aj_reminder_notifications enable row level security;
alter table public.aj_reminder_push_subscriptions enable row level security;
alter table public.aj_reminder_user_settings enable row level security;
alter table public.aj_reminder_activity_logs enable row level security;

-- reminders
drop policy if exists aj_reminders_select on public.aj_reminders;
create policy aj_reminders_select on public.aj_reminders
for select to authenticated
using (
  public.is_admin()
  or created_by = auth.uid()
  or exists (
    select 1 from public.aj_reminder_assignees a
    where a.reminder_id = id and a.user_id = auth.uid()
  )
);

drop policy if exists aj_reminders_insert on public.aj_reminders;
create policy aj_reminders_insert on public.aj_reminders
for insert to authenticated
with check (
  created_by = auth.uid()
  or public.is_admin()
);

drop policy if exists aj_reminders_update on public.aj_reminders;
create policy aj_reminders_update on public.aj_reminders
for update to authenticated
using (
  public.is_admin()
  or created_by = auth.uid()
  or exists (
    select 1 from public.aj_reminder_assignees a
    where a.reminder_id = id and a.user_id = auth.uid() and a.role = 'assignee'
  )
)
with check (
  public.is_admin()
  or created_by = auth.uid()
  or exists (
    select 1 from public.aj_reminder_assignees a
    where a.reminder_id = id and a.user_id = auth.uid() and a.role = 'assignee'
  )
);

drop policy if exists aj_reminders_delete on public.aj_reminders;
create policy aj_reminders_delete on public.aj_reminders
for delete to authenticated
using (public.is_admin() or created_by = auth.uid());

-- assignees
drop policy if exists aj_reminder_assignees_select on public.aj_reminder_assignees;
create policy aj_reminder_assignees_select on public.aj_reminder_assignees
for select to authenticated
using (public.aj_reminder_user_can_access(reminder_id));

drop policy if exists aj_reminder_assignees_write on public.aj_reminder_assignees;
create policy aj_reminder_assignees_write on public.aj_reminder_assignees
for all to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.aj_reminders r
    where r.id = reminder_id and r.created_by = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.aj_reminders r
    where r.id = reminder_id and r.created_by = auth.uid()
  )
);

-- alerts (users read via reminder access; writes mainly via service role / creator)
drop policy if exists aj_reminder_alerts_select on public.aj_reminder_alerts;
create policy aj_reminder_alerts_select on public.aj_reminder_alerts
for select to authenticated
using (public.aj_reminder_user_can_access(reminder_id));

drop policy if exists aj_reminder_alerts_write on public.aj_reminder_alerts;
create policy aj_reminder_alerts_write on public.aj_reminder_alerts
for all to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.aj_reminders r
    where r.id = reminder_id and r.created_by = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.aj_reminders r
    where r.id = reminder_id and r.created_by = auth.uid()
  )
);

-- notifications
drop policy if exists aj_reminder_notifications_select on public.aj_reminder_notifications;
create policy aj_reminder_notifications_select on public.aj_reminder_notifications
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists aj_reminder_notifications_update on public.aj_reminder_notifications;
create policy aj_reminder_notifications_update on public.aj_reminder_notifications
for update to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists aj_reminder_notifications_insert on public.aj_reminder_notifications;
create policy aj_reminder_notifications_insert on public.aj_reminder_notifications
for insert to authenticated
with check (user_id = auth.uid() or public.is_admin());

-- push subscriptions
drop policy if exists aj_reminder_push_subs_own on public.aj_reminder_push_subscriptions;
create policy aj_reminder_push_subs_own on public.aj_reminder_push_subscriptions
for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

-- settings
drop policy if exists aj_reminder_user_settings_own on public.aj_reminder_user_settings;
create policy aj_reminder_user_settings_own on public.aj_reminder_user_settings
for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

-- activity logs
drop policy if exists aj_reminder_activity_select on public.aj_reminder_activity_logs;
create policy aj_reminder_activity_select on public.aj_reminder_activity_logs
for select to authenticated
using (public.aj_reminder_user_can_access(reminder_id));

drop policy if exists aj_reminder_activity_insert on public.aj_reminder_activity_logs;
create policy aj_reminder_activity_insert on public.aj_reminder_activity_logs
for insert to authenticated
with check (public.aj_reminder_user_can_access(reminder_id));

grant select, insert, update, delete on public.aj_reminders to authenticated;
grant select, insert, update, delete on public.aj_reminder_assignees to authenticated;
grant select, insert, update, delete on public.aj_reminder_alerts to authenticated;
grant select, insert, update, delete on public.aj_reminder_notifications to authenticated;
grant select, insert, update, delete on public.aj_reminder_push_subscriptions to authenticated;
grant select, insert, update, delete on public.aj_reminder_user_settings to authenticated;
grant select, insert on public.aj_reminder_activity_logs to authenticated;

comment on table public.aj_reminders is
  'AJ Academy Reminders & Calendar — additive module; soft-links related CRM IDs without FKs.';
