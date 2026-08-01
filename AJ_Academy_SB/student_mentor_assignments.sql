-- Student↔mentor assignments (Phases 11–18). Separate from mentor_allocations (teaching scope).
-- Safe to re-run. Prerequisite: profiles, academic_* optional FKs.

create table if not exists public.mentor_capacity (
  mentor_id uuid primary key references public.profiles(id) on delete cascade,
  max_total_students integer not null default 50 check (max_total_students >= 0),
  max_primary_students integer not null default 40 check (max_primary_students >= 0),
  max_secondary_students integer not null default 20 check (max_secondary_students >= 0),
  max_projects integer not null default 20 check (max_projects >= 0),
  max_active_tests integer not null default 20 check (max_active_tests >= 0),
  max_batches integer not null default 10 check (max_batches >= 0),
  preferred_department_ids uuid[] not null default '{}',
  preferred_course_ids uuid[] not null default '{}',
  expertise text[] not null default '{}',
  availability text not null default 'available'
    check (availability in ('available', 'limited', 'unavailable', 'on_leave')),
  is_active boolean not null default true,
  notes text,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_mentor_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  mentor_id uuid not null references public.profiles(id) on delete restrict,
  mentor_role text not null default 'academic'
    check (mentor_role in (
      'primary_academic',
      'secondary',
      'academic',
      'project',
      'placement',
      'technical',
      'support',
      'backup'
    )),
  is_primary boolean not null default false,
  department_id uuid references public.academic_departments(id) on delete set null,
  course_id uuid references public.academic_courses(id) on delete set null,
  batch_id uuid references public.academic_batches(id) on delete set null,
  module_id uuid references public.academic_modules(id) on delete set null,
  subject_or_module text,
  allocation_percent numeric(5,2) default 100
    check (allocation_percent is null or (allocation_percent > 0 and allocation_percent <= 100)),
  start_date date not null default (timezone('utc', now()))::date,
  end_date date,
  is_temporary boolean not null default false,
  auto_expire boolean not null default true,
  status text not null default 'active'
    check (status in (
      'draft', 'active', 'inactive', 'completed', 'transferred', 'revoked', 'expired'
    )),
  reason text,
  notes text,
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  capacity_override boolean not null default false,
  capacity_override_reason text,
  transferred_from_id uuid references public.student_mentor_assignments(id) on delete set null,
  retain_readonly_access boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create unique index if not exists student_mentor_assignments_active_primary_uidx
  on public.student_mentor_assignments (student_id)
  where status = 'active' and is_primary = true;

create unique index if not exists student_mentor_assignments_no_dup_active_uidx
  on public.student_mentor_assignments (
    student_id,
    mentor_id,
    mentor_role,
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'active';

create index if not exists student_mentor_assignments_mentor_active_idx
  on public.student_mentor_assignments (mentor_id, status)
  where status = 'active';

create index if not exists student_mentor_assignments_student_idx
  on public.student_mentor_assignments (student_id, status);

create index if not exists student_mentor_assignments_end_date_idx
  on public.student_mentor_assignments (end_date)
  where status = 'active' and end_date is not null;

create or replace function public.student_mentor_assignments_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists student_mentor_assignments_touch_trg on public.student_mentor_assignments;
create trigger student_mentor_assignments_touch_trg
before update on public.student_mentor_assignments
for each row execute function public.student_mentor_assignments_touch();

create or replace function public.mentor_capacity_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mentor_capacity_touch_trg on public.mentor_capacity;
create trigger mentor_capacity_touch_trg
before update on public.mentor_capacity
for each row execute function public.mentor_capacity_touch();

-- Sync legacy assigned_mentor_id when primary academic assignment is active
create or replace function public.sma_sync_legacy_primary_mentor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    if new.is_primary and new.status = 'active' then
      update public.profiles
      set assigned_mentor_id = new.mentor_id
      where id = new.student_id;
    elsif new.status in ('revoked', 'transferred', 'expired', 'completed', 'inactive') and new.is_primary then
      update public.profiles p
      set assigned_mentor_id = null
      where p.id = new.student_id
        and p.assigned_mentor_id = new.mentor_id
        and not exists (
          select 1 from public.student_mentor_assignments a
          where a.student_id = new.student_id
            and a.status = 'active'
            and a.is_primary = true
            and a.id <> new.id
        );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sma_sync_legacy_primary_mentor_trg on public.student_mentor_assignments;
create trigger sma_sync_legacy_primary_mentor_trg
after insert or update on public.student_mentor_assignments
for each row execute function public.sma_sync_legacy_primary_mentor();

-- Expire temporary / dated assignments
create or replace function public.expire_student_mentor_assignments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.student_mentor_assignments
  set status = 'expired', updated_at = now()
  where status = 'active'
    and end_date is not null
    and end_date < (timezone('utc', now()))::date
    and (is_temporary = true or auto_expire = true);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.expire_student_mentor_assignments() to authenticated;

-- Access helper: mentor may see student if active assignment (or readonly historical) or scope allocation
create or replace function public.sma_mentor_can_access_student(p_mentor uuid, p_student uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_scope boolean := false;
begin
  if exists (
    select 1
    from public.student_mentor_assignments a
    where a.mentor_id = p_mentor
      and a.student_id = p_student
      and (
        a.status = 'active'
        or (a.retain_readonly_access = true and a.status in ('transferred', 'completed', 'expired'))
      )
  ) then
    return true;
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = p_student and p.assigned_mentor_id = p_mentor
  ) then
    return true;
  end if;

  begin
    execute 'select public.lms_mentor_can_access_student($1, $2)'
      into v_scope
      using p_mentor, p_student;
  exception when undefined_function then
    v_scope := false;
  end;

  return coalesce(v_scope, false);
end;
$$;

grant execute on function public.sma_mentor_can_access_student(uuid, uuid) to authenticated;

alter table public.mentor_capacity enable row level security;
alter table public.student_mentor_assignments enable row level security;

grant select, insert, update, delete on public.mentor_capacity to authenticated;
grant select, insert, update, delete on public.student_mentor_assignments to authenticated;

drop policy if exists mentor_capacity_admin_all on public.mentor_capacity;
create policy mentor_capacity_admin_all on public.mentor_capacity
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists mentor_capacity_self_select on public.mentor_capacity;
create policy mentor_capacity_self_select on public.mentor_capacity
  for select to authenticated using (mentor_id = auth.uid() or public.is_admin());

drop policy if exists sma_admin_all on public.student_mentor_assignments;
create policy sma_admin_all on public.student_mentor_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists sma_mentor_select on public.student_mentor_assignments;
create policy sma_mentor_select on public.student_mentor_assignments
  for select to authenticated
  using (
    public.is_admin()
    or mentor_id = auth.uid()
    or (
      student_id = auth.uid()
      and status in ('active', 'transferred', 'completed', 'expired')
    )
  );

drop policy if exists sma_student_select_own on public.student_mentor_assignments;
-- covered above

-- Capacity override audit via application writeAuditLog; optional table
create table if not exists public.mentor_capacity_overrides (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references public.student_mentor_assignments(id) on delete set null,
  mentor_id uuid not null references public.profiles(id),
  student_id uuid references public.profiles(id),
  reason text not null,
  overridden_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.mentor_capacity_overrides enable row level security;
grant select, insert on public.mentor_capacity_overrides to authenticated;

drop policy if exists mentor_capacity_overrides_admin on public.mentor_capacity_overrides;
create policy mentor_capacity_overrides_admin on public.mentor_capacity_overrides
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
