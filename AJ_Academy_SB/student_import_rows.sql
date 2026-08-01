-- Portal student import rows + mapping persistence (Phases 3–10).
-- Safe to re-run. Prerequisite: student_import_batches.sql

alter table public.student_import_batches
  add column if not exists column_mapping jsonb not null default '{}'::jsonb,
  add column if not exists mapping_confirmed_at timestamptz,
  add column if not exists mapping_confirmed_by uuid references public.profiles(id),
  add column if not exists dry_run_at timestamptz,
  add column if not exists dry_run_summary jsonb,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists created_count integer not null default 0,
  add column if not exists updated_count integer not null default 0,
  add column if not exists skipped_count integer not null default 0,
  add column if not exists failed_count integer not null default 0,
  add column if not exists parent_batch_id uuid references public.student_import_batches(id),
  add column if not exists confirm_update_existing boolean not null default false;

-- Expand import_mode check via drop/recreate if needed
do $$
begin
  alter table public.student_import_batches drop constraint if exists student_import_batches_import_mode_check;
exception when undefined_object then null;
end $$;

alter table public.student_import_batches
  drop constraint if exists student_import_batches_import_mode_check;

alter table public.student_import_batches
  add constraint student_import_batches_import_mode_check
  check (
    import_mode is null or import_mode in (
      'create_only',
      'update_only',
      'create_and_update',
      'skip_duplicates',
      'stop_on_error',
      'import_valid_skip_invalid'
    )
  );

create table if not exists public.student_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.student_import_batches(id) on delete cascade,
  row_number integer not null,
  raw jsonb not null default '{}'::jsonb,
  mapped jsonb not null default '{}'::jsonb,
  severity text not null default 'pending'
    check (severity in ('pending', 'valid', 'warning', 'error')),
  issues jsonb not null default '[]'::jsonb,
  action text
    check (action is null or action in ('create', 'update', 'skip', 'blocked')),
  idempotency_key text,
  result_status text
    check (result_status is null or result_status in (
      'pending', 'created', 'updated', 'skipped', 'failed', 'blocked'
    )),
  result_profile_id uuid references public.profiles(id) on delete set null,
  result_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, row_number)
);

create index if not exists student_import_rows_batch_severity_idx
  on public.student_import_rows (batch_id, severity);

create index if not exists student_import_rows_batch_action_idx
  on public.student_import_rows (batch_id, action);

create index if not exists student_import_rows_idempotency_idx
  on public.student_import_rows (idempotency_key)
  where idempotency_key is not null;

create or replace function public.student_import_rows_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists student_import_rows_touch_trg on public.student_import_rows;
create trigger student_import_rows_touch_trg
before update on public.student_import_rows
for each row execute function public.student_import_rows_touch();

alter table public.student_import_rows enable row level security;
grant select, insert, update, delete on public.student_import_rows to authenticated;

drop policy if exists student_import_rows_admin_all on public.student_import_rows;
create policy student_import_rows_admin_all
on public.student_import_rows
for all to authenticated
using (public.is_admin())
with check (public.is_admin());
