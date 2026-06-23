-- BB Internal OS — CRM satellite tables + legacy upgrades

--

-- This is NOT a second "clients" database: the single source of truth is public.clients

-- (see client_lead_schema.sql for the full column model).

--

-- Run AFTER client_lead_schema.sql.

--

-- Responsibilities here:

--   1) Strip legacy CHECK constraints from very old installs (narrow source/status lists).

--   2) ADD COLUMN IF NOT EXISTS for databases created before CRM columns landed in client_lead_schema.

--   3) Data backfills (lead_name, status wording).

--   4) lead_followups, lead_activities, client_documents + RLS + realtime.

--   5) clients RLS for manager read + employee update (idempotent — same as modern client_lead_schema;

--      kept so a project that only ever ran an old narrow client_lead_schema.sql still gets these

--      policies when this file is applied).



-- ----------------------------

-- Legacy narrow table → CRM shape (safe if already current)

-- ----------------------------



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

alter table public.clients add column if not exists budget numeric (12, 2);

alter table public.clients add column if not exists expected_start_date date;

alter table public.clients add column if not exists priority text default 'Warm';

alter table public.clients add column if not exists lead_score integer default 0;

alter table public.clients add column if not exists assigned_to uuid references public.profiles (id);

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



-- Migrate legacy naming

update public.clients

set lead_name = coalesce(nullif(trim(lead_name), ''), trim(name))

where lead_name is null or trim(coalesce(lead_name, '')) = '';



update public.clients

set status = 'New Lead'

where lower(coalesce(trim(status), '')) = 'lead';



-- Indexes (IF NOT EXISTS — fine to re-run after client_lead_schema v2)

create index if not exists clients_lead_priority_idx on public.clients (priority);

create index if not exists clients_service_interest_idx on public.clients (service_interest);

create index if not exists clients_proposal_status_idx on public.clients (proposal_status);

create index if not exists clients_converted_at_idx on public.clients (converted_at desc);

create index if not exists clients_client_code_idx on public.clients (client_code);



-- ----------------------------

-- Follow-up instances

-- ----------------------------



create table if not exists public.lead_followups (

  id uuid primary key default gen_random_uuid (),

  client_id uuid not null references public.clients (id) on delete cascade,

  follow_up_date date,

  follow_up_time time,

  follow_up_type text,

  status text not null default 'Pending',

  notes text,

  created_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()

);



create index if not exists lead_followups_client_id_idx on public.lead_followups (client_id);

create index if not exists lead_followups_date_idx on public.lead_followups (follow_up_date);

create index if not exists lead_followups_status_idx on public.lead_followups (status);



create or replace function public.lead_followups_set_updated_at ()

returns trigger

language plpgsql

as $$

begin

  new.updated_at = now();

  return new;

end;

$$;



drop trigger if exists lead_followups_set_updated_at_trigger on public.lead_followups;

create trigger lead_followups_set_updated_at_trigger

before update on public.lead_followups

for each row

execute function public.lead_followups_set_updated_at ();



-- ----------------------------

-- Activity timeline

-- ----------------------------



create table if not exists public.lead_activities (

  id uuid primary key default gen_random_uuid (),

  client_id uuid not null references public.clients (id) on delete cascade,

  activity_type text not null,

  notes text,

  old_value text,

  new_value text,

  created_by uuid references public.profiles (id),

  created_at timestamptz not null default now ()

);



create index if not exists lead_activities_client_id_idx on public.lead_activities (client_id);

create index if not exists lead_activities_created_at_idx on public.lead_activities (created_at desc);



-- ----------------------------

-- Client documents

-- ----------------------------



create table if not exists public.client_documents (

  id uuid primary key default gen_random_uuid (),

  client_id uuid not null references public.clients (id) on delete cascade,

  document_type text,

  document_name text,

  document_url text not null,

  uploaded_by uuid references public.profiles (id),

  created_at timestamptz not null default now ()

);



create index if not exists client_documents_client_id_idx on public.client_documents (client_id);



-- ----------------------------

-- RLS: lead_followups

-- ----------------------------



alter table public.lead_followups enable row level security;



drop policy if exists "lead_followups_admin_all" on public.lead_followups;

create policy "lead_followups_admin_all"

on public.lead_followups

for all

to authenticated

using (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid ()

      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')

  )

)

with check (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid ()

      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')

  )

);



drop policy if exists "lead_followups_manager_read" on public.lead_followups;

create policy "lead_followups_manager_read"

on public.lead_followups

for select

to authenticated

using (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid ()

      and lower(coalesce(p.role, '')) = 'manager'

  )

);



drop policy if exists "lead_followups_employee_select" on public.lead_followups;

create policy "lead_followups_employee_select"

on public.lead_followups

for select

to authenticated

using (

  exists (

    select 1

    from public.clients c

    where c.id = client_id

      and c.assigned_to = auth.uid ()

  )

);



drop policy if exists "lead_followups_employee_insert" on public.lead_followups;

create policy "lead_followups_employee_insert"

on public.lead_followups

for insert

to authenticated

with check (

  exists (

    select 1

    from public.clients c

    where c.id = client_id

      and c.assigned_to = auth.uid ()

  )

);



drop policy if exists "lead_followups_employee_update" on public.lead_followups;

create policy "lead_followups_employee_update"

on public.lead_followups

for update

to authenticated

using (

  exists (

    select 1

    from public.clients c

    where c.id = client_id

      and c.assigned_to = auth.uid ()

  )

)

with check (

  exists (

    select 1

    from public.clients c

    where c.id = client_id

      and c.assigned_to = auth.uid ()

  )

);



-- ----------------------------

-- RLS: lead_activities

-- ----------------------------



alter table public.lead_activities enable row level security;



drop policy if exists "lead_activities_admin_all" on public.lead_activities;

create policy "lead_activities_admin_all"

on public.lead_activities

for all

to authenticated

using (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid ()

      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')

  )

)

with check (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid ()

      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')

  )

);



drop policy if exists "lead_activities_manager_read" on public.lead_activities;

create policy "lead_activities_manager_read"

on public.lead_activities

for select

to authenticated

using (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid ()

      and lower(coalesce(p.role, '')) = 'manager'

  )

);



drop policy if exists "lead_activities_employee_select" on public.lead_activities;

create policy "lead_activities_employee_select"

on public.lead_activities

for select

to authenticated

using (

  exists (

    select 1

    from public.clients c

    where c.id = client_id

      and c.assigned_to = auth.uid ()

  )

);



drop policy if exists "lead_activities_employee_insert" on public.lead_activities;

create policy "lead_activities_employee_insert"

on public.lead_activities

for insert

to authenticated

with check (

  exists (

    select 1

    from public.clients c

    where c.id = client_id

      and c.assigned_to = auth.uid ()

  )

);



-- ----------------------------

-- RLS: client_documents

-- ----------------------------



alter table public.client_documents enable row level security;



drop policy if exists "client_documents_admin_all" on public.client_documents;

create policy "client_documents_admin_all"

on public.client_documents

for all

to authenticated

using (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid ()

      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')

  )

)

with check (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid ()

      and lower(coalesce(p.role, '')) in ('admin', 'super_admin')

  )

);



drop policy if exists "client_documents_manager_read" on public.client_documents;

create policy "client_documents_manager_read"

on public.client_documents

for select

to authenticated

using (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid ()

      and lower(coalesce(p.role, '')) = 'manager'

  )

);



drop policy if exists "client_documents_employee_assigned_rw" on public.client_documents;

create policy "client_documents_employee_assigned_rw"

on public.client_documents

for insert

to authenticated

with check (

  exists (

    select 1

    from public.clients c

    where c.id = client_id

      and c.assigned_to = auth.uid ()

  )

);



drop policy if exists "client_documents_employee_assigned_select" on public.client_documents;

create policy "client_documents_employee_assigned_select"

on public.client_documents

for select

to authenticated

using (

  exists (

    select 1

    from public.clients c

    where c.id = client_id

      and c.assigned_to = auth.uid ()

  )

);



-- ----------------------------

-- clients: manager + employee update (upgrade path + idempotent with client_lead_schema v2)

-- ----------------------------



drop policy if exists "clients_manager_select_all" on public.clients;

create policy "clients_manager_select_all"

on public.clients

for select

to authenticated

using (

  exists (

    select 1

    from public.profiles p

    where p.id = auth.uid ()

      and lower(coalesce(p.role, '')) = 'manager'

  )

);



drop policy if exists "clients_employee_update_assigned" on public.clients;

create policy "clients_employee_update_assigned"

on public.clients

for update

to authenticated

using (assigned_to = auth.uid ())

with check (assigned_to = auth.uid ());



-- ----------------------------

-- Realtime

-- ----------------------------



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

      and c.relname = 'lead_followups'

  ) then

    alter publication supabase_realtime add table public.lead_followups;

  end if;



  if not exists (

    select 1

    from pg_publication_rel pr

    join pg_class c on c.oid = pr.prrelid

    join pg_namespace n on n.oid = c.relnamespace

    join pg_publication p on p.oid = pr.prpubid

    where p.pubname = 'supabase_realtime'

      and n.nspname = 'public'

      and c.relname = 'lead_activities'

  ) then

    alter publication supabase_realtime add table public.lead_activities;

  end if;



  if not exists (

    select 1

    from pg_publication_rel pr

    join pg_class c on c.oid = pr.prrelid

    join pg_namespace n on n.oid = c.relnamespace

    join pg_publication p on p.oid = pr.prpubid

    where p.pubname = 'supabase_realtime'

      and n.nspname = 'public'

      and c.relname = 'client_documents'

  ) then

    alter publication supabase_realtime add table public.client_documents;

  end if;

end

$$;

