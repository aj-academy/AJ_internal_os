-- =============================================================================
-- LMS Phase 14 — Study materials
-- Run after: lms_mentor_allocations.sql (and ideally lms_assignments.sql)
-- Safe to re-run.
-- =============================================================================

create table if not exists public.lms_study_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  department_id uuid not null references public.academic_departments (id) on delete restrict,
  course_id uuid references public.academic_courses (id) on delete set null,
  batch_id uuid references public.academic_batches (id) on delete set null,
  module_id uuid references public.academic_modules (id) on delete set null,
  topic text,
  material_type text not null default 'pdf'
    check (material_type in (
      'pdf', 'document', 'presentation', 'spreadsheet', 'image', 'video', 'audio',
      'external_link', 'youtube', 'code', 'zip', 'notes', 'recorded_session', 'reference_book'
    )),
  file_path text,
  file_name text,
  file_mime text,
  file_size_bytes bigint,
  external_url text,
  thumbnail_path text,
  tags text[] not null default '{}'::text[],
  published_at timestamptz,
  expires_at timestamptz,
  download_allowed boolean not null default true,
  view_only boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'archived', 'expired')),
  audience_type text not null default 'selected_students'
    check (audience_type in (
      'individual', 'selected_students', 'batch', 'department', 'course', 'custom_group'
    )),
  assigned_by uuid not null references public.profiles (id) on delete restrict,
  publish_idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint lms_study_materials_publish_key_unique unique (publish_idempotency_key)
);

create index if not exists lms_study_materials_dept_idx on public.lms_study_materials (department_id);
create index if not exists lms_study_materials_status_idx on public.lms_study_materials (status);

drop trigger if exists lms_study_materials_touch on public.lms_study_materials;
create trigger lms_study_materials_touch
  before update on public.lms_study_materials
  for each row execute function public.lms_touch_updated_at();

create table if not exists public.lms_study_material_recipients (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.lms_study_materials (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  enrolment_id uuid references public.student_enrolments (id) on delete set null,
  status text not null default 'assigned'
    check (status in (
      'assigned', 'not_viewed', 'viewed', 'opened', 'downloaded', 'completed', 'acknowledged'
    )),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  download_count integer not null default 0,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lms_study_material_recipients_unique unique (material_id, student_id)
);

create index if not exists lms_study_material_recipients_student_idx
  on public.lms_study_material_recipients (student_id);

drop trigger if exists lms_study_material_recipients_touch on public.lms_study_material_recipients;
create trigger lms_study_material_recipients_touch
  before update on public.lms_study_material_recipients
  for each row execute function public.lms_touch_updated_at();

create table if not exists public.lms_material_activity (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.lms_study_materials (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid references public.lms_study_material_recipients (id) on delete set null,
  activity_type text not null
    check (activity_type in ('view', 'open', 'download', 'complete', 'acknowledge')),
  created_at timestamptz not null default now()
);

create index if not exists lms_material_activity_material_idx
  on public.lms_material_activity (material_id, created_at desc);

create or replace function public.lms_publish_study_material(
  p_material_id uuid,
  p_student_ids uuid[] default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  m public.lms_study_materials%rowtype;
  v_ids uuid[];
  v_sid uuid;
  v_count int := 0;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Not authenticated'; end if;
  select * into m from public.lms_study_materials where id = p_material_id for update;
  if not found then raise exception 'Material not found'; end if;

  if m.status = 'published' and m.publish_idempotency_key is not null
     and p_idempotency_key is not null
     and m.publish_idempotency_key = p_idempotency_key then
    return jsonb_build_object('ok', true, 'idempotent', true, 'material_id', m.id);
  end if;

  if not public.is_admin() then
    if not public.lms_mentor_has_active_allocation(
      v_actor, m.department_id, m.course_id, m.batch_id, m.module_id
    ) then
      raise exception 'No active mentor allocation for this scope';
    end if;
    if m.assigned_by <> v_actor then
      raise exception 'Only the assigner or admin can publish';
    end if;
  end if;

  if p_student_ids is not null and array_length(p_student_ids, 1) > 0 then
    v_ids := p_student_ids;
  else
    select coalesce(array_agg(s.student_id), array[]::uuid[])
      into v_ids
    from public.lms_eligible_students_for_scope(m.department_id, m.course_id, m.batch_id) s;
  end if;

  if v_ids is null or coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'No eligible students for this audience';
  end if;

  foreach v_sid in array v_ids
  loop
    insert into public.lms_study_material_recipients (material_id, student_id, enrolment_id, status)
    values (
      m.id,
      v_sid,
      (
        select e.id from public.student_enrolments e
        where e.student_id = v_sid and e.status = 'active'
          and e.department_id = m.department_id
          and (m.course_id is null or e.course_id = m.course_id)
          and (m.batch_id is null or e.batch_id is null or e.batch_id = m.batch_id)
        order by e.enrolled_at desc limit 1
      ),
      'not_viewed'
    )
    on conflict (material_id, student_id) do nothing;
  end loop;

  select count(*)::int into v_count from public.lms_study_material_recipients where material_id = m.id;

  update public.lms_study_materials
  set
    status = case when published_at is not null and published_at > now() then 'scheduled' else 'published' end,
    published_at = coalesce(published_at, now()),
    publish_idempotency_key = coalesce(p_idempotency_key, publish_idempotency_key, gen_random_uuid()::text),
    updated_by = v_actor,
    updated_at = now()
  where id = m.id;

  return jsonb_build_object('ok', true, 'material_id', m.id, 'recipient_count', v_count);
end;
$$;

grant execute on function public.lms_publish_study_material(uuid, uuid[], text) to authenticated;

create or replace function public.lms_track_material_activity(
  p_material_id uuid,
  p_activity_type text
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_student uuid := auth.uid();
  v_recipient uuid;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;
  if p_activity_type not in ('view', 'open', 'download', 'complete', 'acknowledge') then
    raise exception 'Invalid activity type';
  end if;

  select id into v_recipient
  from public.lms_study_material_recipients
  where material_id = p_material_id and student_id = v_student;

  if v_recipient is null then
    raise exception 'Material not assigned to this student';
  end if;

  insert into public.lms_material_activity (material_id, student_id, recipient_id, activity_type)
  values (p_material_id, v_student, v_recipient, p_activity_type);

  update public.lms_study_material_recipients
  set
    first_opened_at = coalesce(first_opened_at, case when p_activity_type in ('view', 'open') then now() else first_opened_at end),
    last_opened_at = case when p_activity_type in ('view', 'open', 'download') then now() else last_opened_at end,
    download_count = download_count + case when p_activity_type = 'download' then 1 else 0 end,
    acknowledged_at = case when p_activity_type = 'acknowledge' then now() else acknowledged_at end,
    status = case
      when p_activity_type = 'acknowledge' then 'acknowledged'
      when p_activity_type = 'complete' then 'completed'
      when p_activity_type = 'download' then 'downloaded'
      when p_activity_type in ('view', 'open') and status in ('assigned', 'not_viewed') then 'viewed'
      else status
    end,
    updated_at = now()
  where id = v_recipient;
end;
$$;

grant execute on function public.lms_track_material_activity(uuid, text) to authenticated;

-- Private study-materials bucket (signed URLs via app later)
insert into storage.buckets (id, name, public)
values ('study-materials', 'study-materials', false)
on conflict (id) do update set public = excluded.public;

alter table public.lms_study_materials enable row level security;
alter table public.lms_study_material_recipients enable row level security;
alter table public.lms_material_activity enable row level security;

grant select, insert, update, delete on public.lms_study_materials to authenticated;
grant select, insert, update, delete on public.lms_study_material_recipients to authenticated;
grant select, insert on public.lms_material_activity to authenticated;

drop policy if exists lms_study_materials_admin_all on public.lms_study_materials;
create policy lms_study_materials_admin_all on public.lms_study_materials
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_study_materials_mentor_rw on public.lms_study_materials;
create policy lms_study_materials_mentor_rw on public.lms_study_materials
  for all to authenticated
  using (
    public.is_mentor_role()
    and (
      assigned_by = auth.uid()
      or public.lms_mentor_has_active_allocation(auth.uid(), department_id, course_id, batch_id, module_id)
    )
  )
  with check (
    public.is_mentor_role()
    and public.lms_mentor_has_active_allocation(auth.uid(), department_id, course_id, batch_id, module_id)
  );

drop policy if exists lms_study_materials_student_select on public.lms_study_materials;
create policy lms_study_materials_student_select on public.lms_study_materials
  for select to authenticated
  using (
    status in ('published', 'scheduled')
    and exists (
      select 1 from public.lms_study_material_recipients r
      where r.material_id = lms_study_materials.id and r.student_id = auth.uid()
    )
  );

drop policy if exists lms_study_material_recipients_admin_all on public.lms_study_material_recipients;
create policy lms_study_material_recipients_admin_all on public.lms_study_material_recipients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_study_material_recipients_student on public.lms_study_material_recipients;
create policy lms_study_material_recipients_student on public.lms_study_material_recipients
  for select to authenticated using (student_id = auth.uid() or public.is_admin());

drop policy if exists lms_study_material_recipients_mentor on public.lms_study_material_recipients;
create policy lms_study_material_recipients_mentor on public.lms_study_material_recipients
  for select to authenticated
  using (
    public.is_mentor_role()
    and exists (
      select 1 from public.lms_study_materials m
      where m.id = material_id and m.assigned_by = auth.uid()
    )
  );

drop policy if exists lms_material_activity_admin_all on public.lms_material_activity;
create policy lms_material_activity_admin_all on public.lms_material_activity
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_material_activity_student_insert on public.lms_material_activity;
create policy lms_material_activity_student_insert on public.lms_material_activity
  for insert to authenticated with check (student_id = auth.uid());

drop policy if exists lms_material_activity_student_select on public.lms_material_activity;
create policy lms_material_activity_student_select on public.lms_material_activity
  for select to authenticated using (student_id = auth.uid() or public.is_admin());

comment on table public.lms_study_materials is 'LMS study materials with publish-time recipients.';
