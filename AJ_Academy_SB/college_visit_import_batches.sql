-- College Visits bulk import batches (file upload preview + duplicate check).
-- Safe to re-run. Prerequisite: college_visits_schema.sql, profiles, is_admin().

create table if not exists public.college_visit_import_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  file_name text not null,
  file_hash text,
  row_count integer not null default 0,
  new_count integer not null default 0,
  duplicate_count integer not null default 0,
  invalid_count integer not null default 0,
  created_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'ready_for_review'
    check (status in (
      'ready_for_review',
      'importing',
      'completed',
      'completed_with_errors',
      'failed',
      'cancelled'
    )),
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  error_message text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists college_visit_import_batches_uploaded_at_idx
  on public.college_visit_import_batches (uploaded_at desc);

create index if not exists college_visit_import_batches_uploaded_by_idx
  on public.college_visit_import_batches (uploaded_by);

create index if not exists college_visit_import_batches_file_hash_idx
  on public.college_visit_import_batches (file_hash)
  where file_hash is not null;

create table if not exists public.college_visit_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.college_visit_import_batches(id) on delete cascade,
  row_number integer not null,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'duplicate', 'invalid', 'imported', 'failed', 'skipped')),
  duplicate_of uuid references public.college_visits(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists college_visit_import_rows_batch_id_idx
  on public.college_visit_import_rows (batch_id, row_number);

alter table public.college_visits
  add column if not exists import_batch_id uuid references public.college_visit_import_batches(id) on delete set null;

create index if not exists college_visits_import_batch_id_idx
  on public.college_visits (import_batch_id)
  where import_batch_id is not null;

create or replace function public.college_visit_import_batches_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists college_visit_import_batches_touch_trg on public.college_visit_import_batches;
create trigger college_visit_import_batches_touch_trg
before update on public.college_visit_import_batches
for each row execute function public.college_visit_import_batches_touch();

create or replace function public.college_visit_import_next_batch_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day text := to_char(timezone('utc', now()), 'YYYYMMDD');
  v_count integer;
begin
  select count(*)::integer into v_count
  from public.college_visit_import_batches
  where batch_number like 'CV-' || v_day || '-%';
  return 'CV-' || v_day || '-' || lpad((v_count + 1)::text, 4, '0');
end;
$$;

grant execute on function public.college_visit_import_next_batch_number() to authenticated;

alter table public.college_visit_import_batches enable row level security;
alter table public.college_visit_import_rows enable row level security;

drop policy if exists college_visit_import_batches_admin_all on public.college_visit_import_batches;
create policy college_visit_import_batches_admin_all
on public.college_visit_import_batches for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists college_visit_import_rows_admin_all on public.college_visit_import_rows;
create policy college_visit_import_rows_admin_all
on public.college_visit_import_rows for all to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.college_visit_import_batches to authenticated;
grant select, insert, update, delete on public.college_visit_import_rows to authenticated;

comment on table public.college_visit_import_batches is 'College Visits spreadsheet import batches with duplicate preview before insert.';
comment on table public.college_visit_import_rows is 'Parsed rows for a college import batch before execute.';
