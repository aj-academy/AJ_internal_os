-- Employee Lead Management — extends public.clients (same source as Client Master).
-- Safe to run after project_master_schema.sql (minimal clients stub) OR full student_lead_master_schema.sql.
-- Adds CRM columns, lead_custom_columns, lead_activities, and employee RLS.

-- Core CRM columns (minimal clients stub from project_master_schema lacks these)
alter table public.clients add column if not exists email text;
alter table public.clients add column if not exists phone text;
alter table public.clients add column if not exists whatsapp text;
alter table public.clients add column if not exists requirement text;
alter table public.clients add column if not exists source text;
alter table public.clients add column if not exists priority text default 'Warm';
alter table public.clients add column if not exists assigned_to uuid references public.profiles(id);
alter table public.clients add column if not exists assigned_by uuid references public.profiles(id);
alter table public.clients add column if not exists last_contacted_at timestamptz;
alter table public.clients add column if not exists notes text;
alter table public.clients add column if not exists created_at timestamptz not null default now();

-- Communication tracking + custom fields
alter table public.clients add column if not exists phone_called boolean not null default false;
alter table public.clients add column if not exists whatsapp_sent boolean not null default false;
alter table public.clients add column if not exists phone_called_at timestamptz;
alter table public.clients add column if not exists whatsapp_sent_at timestamptz;
alter table public.clients add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create index if not exists clients_assigned_to_idx on public.clients (assigned_to);
create index if not exists clients_phone_called_idx on public.clients (phone_called);
create index if not exists clients_whatsapp_sent_idx on public.clients (whatsapp_sent);

-- Activity timeline (employee lead history)
create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  activity_type text not null,
  notes text,
  old_value text,
  new_value text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists lead_activities_client_id_idx on public.lead_activities (client_id);
create index if not exists lead_activities_created_at_idx on public.lead_activities (created_at desc);

alter table public.lead_activities enable row level security;

drop policy if exists lead_activities_admin_all on public.lead_activities;
create policy lead_activities_admin_all on public.lead_activities for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists lead_activities_employee_select on public.lead_activities;
create policy lead_activities_employee_select on public.lead_activities for select to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = client_id and c.assigned_to = auth.uid()
  )
);

drop policy if exists lead_activities_employee_insert on public.lead_activities;
create policy lead_activities_employee_insert on public.lead_activities for insert to authenticated
with check (
  exists (
    select 1 from public.clients c
    where c.id = client_id and c.assigned_to = auth.uid()
  )
);

grant select, insert on public.lead_activities to authenticated;

-- Custom column definitions (shared; employees read active columns)
create table if not exists public.lead_custom_columns (
  id uuid primary key default gen_random_uuid(),
  column_name text not null,
  column_key text not null,
  column_type text not null default 'text',
  created_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (column_key)
);

create index if not exists lead_custom_columns_active_idx on public.lead_custom_columns (is_active);

alter table public.lead_custom_columns enable row level security;

drop policy if exists lead_custom_columns_admin_all on public.lead_custom_columns;
create policy lead_custom_columns_admin_all on public.lead_custom_columns for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists lead_custom_columns_employee_read on public.lead_custom_columns;
create policy lead_custom_columns_employee_read on public.lead_custom_columns for select to authenticated
using (is_active = true);

drop policy if exists lead_custom_columns_employee_insert on public.lead_custom_columns;
create policy lead_custom_columns_employee_insert on public.lead_custom_columns for insert to authenticated
with check (created_by = auth.uid());

grant select, insert, update on public.lead_custom_columns to authenticated;

-- Employee access to assigned leads only
drop policy if exists clients_employee_select_assigned on public.clients;
create policy clients_employee_select_assigned on public.clients for select to authenticated
using (assigned_to = auth.uid());

drop policy if exists clients_employee_update_assigned on public.clients;
create policy clients_employee_update_assigned on public.clients for update to authenticated
using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());

drop policy if exists clients_employee_insert_assigned_self on public.clients;
create policy clients_employee_insert_assigned_self on public.clients for insert to authenticated
with check (
  assigned_to = auth.uid()
  and (assigned_by is null or assigned_by = auth.uid())
);

grant select, insert, update on public.clients to authenticated;
