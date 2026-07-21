-- Enable Supabase Realtime for in_app_notifications (bell badge + sound on INSERT).
-- Run after in_app_notifications.sql. Safe to re-run.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables p
    where p.pubname = 'supabase_realtime'
      and p.schemaname = 'public'
      and p.tablename = 'in_app_notifications'
  ) then
    alter publication supabase_realtime add table public.in_app_notifications;
  end if;
end $$;
