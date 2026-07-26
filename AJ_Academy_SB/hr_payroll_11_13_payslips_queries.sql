-- HR, Attendance & Payroll — Phases 11–13: payslips, salary queries, private storage
-- Safe to re-run. Depends on: hr_payroll_07..08_10
--
-- Payslip files are PRIVATE (not public). Access via short-lived signed URLs only.

-- =============================================================================
-- 1) payslips
-- =============================================================================
create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid (),
  payroll_period_id uuid not null references public.payroll_periods (id) on delete cascade,
  payroll_item_id uuid not null references public.payroll_items (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  payslip_number text not null unique,
  year integer not null,
  month integer not null,
  storage_bucket text not null default 'payslips',
  storage_path text not null,
  file_size_bytes integer,
  status text not null default 'generated'
    check (status in ('generated', 'released', 'regenerated', 'failed')),
  generated_at timestamptz not null default now (),
  generated_by uuid references public.profiles (id) on delete set null,
  released_at timestamptz,
  released_by uuid references public.profiles (id) on delete set null,
  generation_error text,
  download_count integer not null default 0,
  last_downloaded_at timestamptz,
  last_downloaded_by uuid references public.profiles (id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  unique (payroll_item_id)
);

create index if not exists payslips_employee_idx on public.payslips (employee_id, year desc, month desc);
create index if not exists payslips_period_idx on public.payslips (payroll_period_id, status);

drop trigger if exists payslips_set_updated_at on public.payslips;
create trigger payslips_set_updated_at
before update on public.payslips
for each row
execute function public.hr_payroll_set_updated_at ();

-- =============================================================================
-- 2) salary_queries
-- =============================================================================
create table if not exists public.salary_queries (
  id uuid primary key default gen_random_uuid (),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  category text not null default 'other'
    check (category in (
      'payslip', 'attendance', 'leave', 'deduction', 'addition', 'payment', 'structure', 'other'
    )),
  subject text not null,
  description text not null,
  attachment_url text,
  status text not null default 'open'
    check (status in ('open', 'under_review', 'resolved', 'rejected', 'closed')),
  hr_response text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index if not exists salary_queries_employee_idx
  on public.salary_queries (employee_id, created_at desc);
create index if not exists salary_queries_status_idx
  on public.salary_queries (status, created_at desc);

drop trigger if exists salary_queries_set_updated_at on public.salary_queries;
create trigger salary_queries_set_updated_at
before update on public.salary_queries
for each row
execute function public.hr_payroll_set_updated_at ();

-- =============================================================================
-- 3) Grants + RLS
-- =============================================================================
grant select, insert, update, delete on table public.payslips to authenticated;
grant select, insert, update, delete on table public.salary_queries to authenticated;

alter table public.payslips enable row level security;
alter table public.salary_queries enable row level security;

-- Payslips: employees read only their RELEASED payslips; admins all
drop policy if exists payslips_select on public.payslips;
create policy payslips_select
on public.payslips
for select
to authenticated
using (
  public.is_admin ()
  or (
    employee_id = auth.uid ()
    and status in ('released', 'regenerated')
    and released_at is not null
  )
);

drop policy if exists payslips_admin_write on public.payslips;
create policy payslips_admin_write
on public.payslips
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

-- Salary queries: employees own; admins all
drop policy if exists salary_queries_select on public.salary_queries;
create policy salary_queries_select
on public.salary_queries
for select
to authenticated
using (employee_id = auth.uid () or public.is_admin ());

drop policy if exists salary_queries_employee_insert on public.salary_queries;
create policy salary_queries_employee_insert
on public.salary_queries
for insert
to authenticated
with check (employee_id = auth.uid () and status = 'open');

drop policy if exists salary_queries_employee_update_own_open on public.salary_queries;
create policy salary_queries_employee_update_own_open
on public.salary_queries
for update
to authenticated
using (employee_id = auth.uid () and status = 'open')
with check (employee_id = auth.uid () and status in ('open', 'closed'));

drop policy if exists salary_queries_admin_all on public.salary_queries;
create policy salary_queries_admin_all
on public.salary_queries
for all
to authenticated
using (public.is_admin ())
with check (public.is_admin ());

-- =============================================================================
-- 4) Private payslips storage bucket
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payslips',
  'payslips',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update set public = false;

-- No direct authenticated storage reads: files are served via service-role signed URLs
-- after the API checks payslips RLS / ownership. Admins may list via service role only.
drop policy if exists payslips_storage_select on storage.objects;
drop policy if exists payslips_storage_insert on storage.objects;
drop policy if exists payslips_storage_update on storage.objects;
drop policy if exists payslips_storage_delete on storage.objects;

-- Intentionally no authenticated storage policies for payslips.
-- All upload/download goes through service-role API routes.

-- Rollback:
--   delete from storage.objects where bucket_id = 'payslips';
--   delete from storage.buckets where id = 'payslips';
--   drop table if exists public.salary_queries cascade;
--   drop table if exists public.payslips cascade;
