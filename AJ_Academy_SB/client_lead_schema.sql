-- Client / Lead Master — FOUNDATION

-- Defines public.clients as the unified lead + mini-CRM header row (Birthmark Brahma workflows).

--

-- Ordering: Keep running client_master_schema.sql AFTER this script for:

--   lead_followups, lead_activities, client_documents, and any legacy upgrades.

--

-- This file avoids restrictive CHECK constraints on source/status so the CRM UI dropdowns stay valid.



create extension if not exists pgcrypto;



create table if not exists public.clients (

  id uuid primary key default gen_random_uuid(),



  -- Legacy display column (app mirrors lead_name into name on writes)

  name text not null,



  client_code text,

  lead_name text,

  company_name text,

  email text,

  phone text,

  whatsapp text,

  city text,

  industry text,

  source text,

  status text not null default 'New Lead',

  service_interest text,

  requirement text,

  budget numeric(12, 2),

  expected_start_date date,



  priority text default 'Warm',

  lead_score integer default 0,



  assigned_to uuid references public.profiles(id),

  assigned_by uuid references public.profiles(id),



  follow_up_date date,

  follow_up_time time,

  follow_up_type text,

  last_contacted_at timestamptz,

  notes text,



  proposal_status text default 'Not Sent',

  proposal_amount numeric(12, 2),

  proposal_sent_date date,

  proposal_link text,

  quotation_link text,

  agreement_link text,



  converted_at timestamptz,

  lost_reason text,



  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()

);

-- If public.clients already existed from an older script, CREATE TABLE IF NOT EXISTS does nothing
-- and columns like lead_name are missing. Add CRM columns before any UPDATE references them.
alter table public.clients drop constraint if exists clients_source_check;
alter table public.clients drop constraint if exists clients_status_check;

alter table public.clients add column if not exists client_code text;
alter table public.clients add column if not exists lead_name text;
alter table public.clients add column if not exists company_name text;
alter table public.clients add column if not exists email text;
alter table public.clients add column if not exists phone text;
alter table public.clients add column if not exists whatsapp text;
alter table public.clients add column if not exists city text;
alter table public.clients add column if not exists industry text;
alter table public.clients add column if not exists source text;
alter table public.clients add column if not exists service_interest text;
alter table public.clients add column if not exists requirement text;
alter table public.clients add column if not exists budget numeric(12, 2);
alter table public.clients add column if not exists expected_start_date date;
alter table public.clients add column if not exists priority text default 'Warm';
alter table public.clients add column if not exists lead_score integer default 0;
alter table public.clients add column if not exists assigned_to uuid references public.profiles(id);
alter table public.clients add column if not exists assigned_by uuid references public.profiles (id);
alter table public.clients add column if not exists follow_up_date date;
alter table public.clients add column if not exists follow_up_time time;
alter table public.clients add column if not exists follow_up_type text;
alter table public.clients add column if not exists last_contacted_at timestamptz;
alter table public.clients add column if not exists proposal_status text default 'Not Sent';
alter table public.clients add column if not exists proposal_amount numeric (12, 2);
alter table public.clients add column if not exists proposal_sent_date date;
alter table public.clients add column if not exists proposal_link text;
alter table public.clients add column if not exists quotation_link text;
alter table public.clients add column if not exists agreement_link text;
alter table public.clients add column if not exists converted_at timestamptz;
alter table public.clients add column if not exists lost_reason text;
alter table public.clients add column if not exists notes text;
alter table public.clients add column if not exists created_at timestamptz not null default now();

-- Keep lead_name/name aligned where only one legacy column existed

update public.clients

set lead_name = coalesce(nullif(trim(lead_name), ''), trim(name))

where lead_name is null or trim(coalesce(lead_name, '')) = '';



-- Normalise obsolete status literal from early schema

update public.clients

set status = 'New Lead'

where lower(trim(coalesce(status, ''))) in ('lead', 'new lead');



create index if not exists clients_status_idx on public.clients(status);

create index if not exists clients_source_idx on public.clients(source);

create index if not exists clients_assigned_to_idx on public.clients(assigned_to);

create index if not exists clients_follow_up_date_idx on public.clients(follow_up_date);

create index if not exists clients_created_at_idx on public.clients(created_at desc);



create index if not exists clients_lead_priority_idx on public.clients(priority);

create index if not exists clients_service_interest_idx on public.clients(service_interest);

create index if not exists clients_proposal_status_idx on public.clients(proposal_status);

create index if not exists clients_converted_at_idx on public.clients(converted_at desc);

create index if not exists clients_client_code_idx on public.clients(client_code);



create or replace function public.clients_set_updated_at()

returns trigger

language plpgsql

as $$

begin

  new.updated_at = now();

  return new;

end;

$$;



drop trigger if exists clients_set_updated_at_trigger on public.clients;

create trigger clients_set_updated_at_trigger

before update on public.clients

for each row

execute function public.clients_set_updated_at();



alter table public.clients enable row level security;



-- Admins — full CRUD

drop policy if exists "clients_admin_select_all" on public.clients;

create policy "clients_admin_select_all"

on public.clients

for select

to authenticated

using (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid()

      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')

  )

);



drop policy if exists "clients_admin_insert_all" on public.clients;

create policy "clients_admin_insert_all"

on public.clients

for insert

to authenticated

with check (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid()

      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')

  )

);



drop policy if exists "clients_admin_update_all" on public.clients;

create policy "clients_admin_update_all"

on public.clients

for update

to authenticated

using (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid()

      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')

  )

)

with check (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid()

      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')

  )

);



drop policy if exists "clients_admin_delete_all" on public.clients;

create policy "clients_admin_delete_all"

on public.clients

for delete

to authenticated

using (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid()

      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')

  )

);



-- Managers — read-all (team pipeline)

drop policy if exists "clients_manager_select_all" on public.clients;

create policy "clients_manager_select_all"

on public.clients

for select

to authenticated

using (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid()

      and lower(coalesce(p.role, '')) = 'manager'

  )

);



-- Employees — assigned rows only + limited update (full CRM edits stay admin-driven in UI)

drop policy if exists "clients_employee_select_assigned" on public.clients;

create policy "clients_employee_select_assigned"

on public.clients

for select

to authenticated

using (assigned_to = auth.uid());



drop policy if exists "clients_employee_update_assigned" on public.clients;

create policy "clients_employee_update_assigned"

on public.clients

for update

to authenticated

using (assigned_to = auth.uid())

with check (assigned_to = auth.uid());



-- Legacy policy name (removed — no blanket employee insert)

drop policy if exists "clients_employee_insert_assigned_self" on public.clients;

drop policy if exists "clients_employee_update_assigned_self" on public.clients;



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

      and c.relname = 'clients'

  ) then

    alter publication supabase_realtime add table public.clients;

  end if;

end

$$;

