-- Employee Lead Management — extends public.clients (same source as Client Master).
-- Run AFTER client_lead_schema.sql and client_master_schema.sql.

-- Communication tracking + custom fields on unified clients table
alter table public.clients add column if not exists phone_called boolean not null default false;
alter table public.clients add column if not exists whatsapp_sent boolean not null default false;
alter table public.clients add column if not exists phone_called_at timestamptz;
alter table public.clients add column if not exists whatsapp_sent_at timestamptz;
alter table public.clients add column if not exists custom_fields jsonb not null default '{}'::jsonb;

create index if not exists clients_phone_called_idx on public.clients (phone_called);
create index if not exists clients_whatsapp_sent_idx on public.clients (whatsapp_sent);

-- Future-ready custom column definitions (shared; employees read active columns)
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
create policy lead_custom_columns_admin_all
on public.lead_custom_columns
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists lead_custom_columns_employee_read on public.lead_custom_columns;
create policy lead_custom_columns_employee_read
on public.lead_custom_columns
for select
to authenticated
using (is_active = true);

drop policy if exists lead_custom_columns_employee_insert on public.lead_custom_columns;
create policy lead_custom_columns_employee_insert
on public.lead_custom_columns
for insert
to authenticated
with check (created_by = auth.uid());

-- Employees may import leads assigned to themselves
drop policy if exists clients_employee_insert_assigned_self on public.clients;
create policy clients_employee_insert_assigned_self
on public.clients
for insert
to authenticated
with check (
  assigned_to = auth.uid()
  and (assigned_by is null or assigned_by = auth.uid())
);

grant select, insert, update on public.lead_custom_columns to authenticated;
