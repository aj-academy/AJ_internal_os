-- =============================================================================
-- Rollback ONLY newly created Reminders & Calendar objects.
-- Does NOT touch Student Master, College Visits, Tasks, Finance, profiles data,
-- or any non-aj_reminder* objects.
-- Review before running.
-- =============================================================================

drop policy if exists aj_reminder_activity_insert on public.aj_reminder_activity_logs;
drop policy if exists aj_reminder_activity_select on public.aj_reminder_activity_logs;
drop policy if exists aj_reminder_user_settings_own on public.aj_reminder_user_settings;
drop policy if exists aj_reminder_push_subs_own on public.aj_reminder_push_subscriptions;
drop policy if exists aj_reminder_notifications_insert on public.aj_reminder_notifications;
drop policy if exists aj_reminder_notifications_update on public.aj_reminder_notifications;
drop policy if exists aj_reminder_notifications_select on public.aj_reminder_notifications;
drop policy if exists aj_reminder_alerts_write on public.aj_reminder_alerts;
drop policy if exists aj_reminder_alerts_select on public.aj_reminder_alerts;
drop policy if exists aj_reminder_assignees_write on public.aj_reminder_assignees;
drop policy if exists aj_reminder_assignees_select on public.aj_reminder_assignees;
drop policy if exists aj_reminders_delete on public.aj_reminders;
drop policy if exists aj_reminders_update on public.aj_reminders;
drop policy if exists aj_reminders_insert on public.aj_reminders;
drop policy if exists aj_reminders_select on public.aj_reminders;

drop trigger if exists aj_reminder_user_settings_updated_at on public.aj_reminder_user_settings;
drop trigger if exists aj_reminder_push_subs_updated_at on public.aj_reminder_push_subscriptions;
drop trigger if exists aj_reminders_set_updated_at on public.aj_reminders;

drop table if exists public.aj_reminder_activity_logs;
drop table if exists public.aj_reminder_notifications;
drop table if exists public.aj_reminder_alerts;
drop table if exists public.aj_reminder_assignees;
drop table if exists public.aj_reminder_push_subscriptions;
drop table if exists public.aj_reminder_user_settings;
drop table if exists public.aj_reminders;

drop function if exists public.aj_reminder_user_can_access(uuid);
drop function if exists public.aj_reminder_is_assignee(uuid);
drop function if exists public.aj_reminder_is_creator(uuid);
drop function if exists public.aj_reminder_set_updated_at();
