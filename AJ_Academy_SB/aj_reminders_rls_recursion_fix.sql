-- =============================================================================
-- Fix: infinite recursion in aj_reminders / aj_reminder_assignees RLS
-- Additive only — replaces reminder RLS policies + small helpers.
-- Does NOT alter CRM tables or existing non-aj_* policies.
-- Safe to re-run.
-- =============================================================================

-- Helper: read assignees without triggering assignees RLS
create or replace function public.aj_reminder_is_assignee(p_reminder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.aj_reminder_assignees a
    where a.reminder_id = p_reminder_id
      and a.user_id = auth.uid()
  );
$$;

grant execute on function public.aj_reminder_is_assignee(uuid) to authenticated;

-- Helper: read reminder ownership without triggering reminders RLS
create or replace function public.aj_reminder_is_creator(p_reminder_id uuid)
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
      and r.created_by = auth.uid()
  );
$$;

grant execute on function public.aj_reminder_is_creator(uuid) to authenticated;

-- Keep access helper but keep row_security off
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
          select 1
          from public.aj_reminder_assignees a
          where a.reminder_id = r.id
            and a.user_id = auth.uid()
        )
      )
  );
$$;

grant execute on function public.aj_reminder_user_can_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- aj_reminders — use SECURITY DEFINER helper instead of subquery on assignees
-- ---------------------------------------------------------------------------
drop policy if exists aj_reminders_select on public.aj_reminders;
create policy aj_reminders_select on public.aj_reminders
for select to authenticated
using (
  public.is_admin()
  or created_by = auth.uid()
  or public.aj_reminder_is_assignee(id)
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
  or public.aj_reminder_is_assignee(id)
)
with check (
  public.is_admin()
  or created_by = auth.uid()
  or public.aj_reminder_is_assignee(id)
);

drop policy if exists aj_reminders_delete on public.aj_reminders;
create policy aj_reminders_delete on public.aj_reminders
for delete to authenticated
using (public.is_admin() or created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- aj_reminder_assignees — avoid can_access (which scanned reminders under RLS)
-- ---------------------------------------------------------------------------
drop policy if exists aj_reminder_assignees_select on public.aj_reminder_assignees;
create policy aj_reminder_assignees_select on public.aj_reminder_assignees
for select to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or public.aj_reminder_is_creator(reminder_id)
);

drop policy if exists aj_reminder_assignees_write on public.aj_reminder_assignees;
create policy aj_reminder_assignees_write on public.aj_reminder_assignees
for all to authenticated
using (
  public.is_admin()
  or public.aj_reminder_is_creator(reminder_id)
)
with check (
  public.is_admin()
  or public.aj_reminder_is_creator(reminder_id)
);

-- ---------------------------------------------------------------------------
-- alerts / activity — same pattern (no nested RLS via raw joins)
-- ---------------------------------------------------------------------------
drop policy if exists aj_reminder_alerts_select on public.aj_reminder_alerts;
create policy aj_reminder_alerts_select on public.aj_reminder_alerts
for select to authenticated
using (
  public.is_admin()
  or public.aj_reminder_is_creator(reminder_id)
  or public.aj_reminder_is_assignee(reminder_id)
);

drop policy if exists aj_reminder_alerts_write on public.aj_reminder_alerts;
create policy aj_reminder_alerts_write on public.aj_reminder_alerts
for all to authenticated
using (
  public.is_admin()
  or public.aj_reminder_is_creator(reminder_id)
)
with check (
  public.is_admin()
  or public.aj_reminder_is_creator(reminder_id)
);

drop policy if exists aj_reminder_activity_select on public.aj_reminder_activity_logs;
create policy aj_reminder_activity_select on public.aj_reminder_activity_logs
for select to authenticated
using (
  public.is_admin()
  or public.aj_reminder_is_creator(reminder_id)
  or public.aj_reminder_is_assignee(reminder_id)
);

drop policy if exists aj_reminder_activity_insert on public.aj_reminder_activity_logs;
create policy aj_reminder_activity_insert on public.aj_reminder_activity_logs
for insert to authenticated
with check (
  public.is_admin()
  or public.aj_reminder_is_creator(reminder_id)
  or public.aj_reminder_is_assignee(reminder_id)
);
