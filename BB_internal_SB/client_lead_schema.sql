create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text,
  email text,
  phone text,
  source text check (source in ('Meta Ads', 'Referral', 'LinkedIn')),
  status text not null default 'Lead' check (status in ('Lead', 'Contacted', 'Converted', 'Lost')),
  requirement text,
  budget numeric(12, 2),
  assigned_to uuid references public.profiles(id),
  follow_up_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_status_idx on public.clients(status);
create index if not exists clients_source_idx on public.clients(source);
create index if not exists clients_assigned_to_idx on public.clients(assigned_to);
create index if not exists clients_follow_up_date_idx on public.clients(follow_up_date);
create index if not exists clients_created_at_idx on public.clients(created_at desc);

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

drop policy if exists "clients_employee_select_assigned" on public.clients;
create policy "clients_employee_select_assigned"
on public.clients
for select
to authenticated
using (assigned_to = auth.uid());

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
