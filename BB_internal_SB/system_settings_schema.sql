-- BB Internal OS — System settings (key/value JSON)
-- Run AFTER: schema.sql (profiles), finance_schema.sql optional (independent).
-- Path: BB_internal_SB/system_settings_schema.sql

create extension if not exists pgcrypto;

create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid (),
  setting_key text not null unique,
  setting_value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now ()
);

create index if not exists system_settings_key_idx on public.system_settings (setting_key);

create or replace function public.system_settings_set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists system_settings_set_updated_at_trigger on public.system_settings;
create trigger system_settings_set_updated_at_trigger
before update on public.system_settings
for each row
execute function public.system_settings_set_updated_at ();

alter table public.system_settings enable row level security;

drop policy if exists "system_settings_admin_all" on public.system_settings;
create policy "system_settings_admin_all"
on public.system_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')
  )
);

insert into public.system_settings (setting_key, setting_value)
values
  ('company', '{}'::jsonb),
  ('attendance', '{}'::jsonb),
  ('crm', '{}'::jsonb),
  ('project', '{}'::jsonb),
  ('finance', '{}'::jsonb),
  ('notifications', '{}'::jsonb),
  ('security', '{}'::jsonb),
  ('preferences', '{}'::jsonb)
on conflict (setting_key) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'system_settings'
  ) then
    alter publication supabase_realtime add table public.system_settings;
  end if;
end
$$;
