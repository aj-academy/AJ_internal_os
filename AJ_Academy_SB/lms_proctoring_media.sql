-- =============================================================================
-- LMS Phase 11 — Proctoring media register + retention purge + SEB notes
-- Run after: lms_calendar_reports.sql (or at least lms_submissions_proctoring.sql)
-- Safe to re-run.
-- =============================================================================

-- Optional expires_at for retention tracking
alter table public.lms_test_proctoring_media
  add column if not exists expires_at timestamptz;

alter table public.lms_test_proctoring_media
  add column if not exists mime_type text;

alter table public.lms_test_proctoring_media
  add column if not exists byte_size bigint;

create index if not exists lms_test_proctoring_media_expires_idx
  on public.lms_test_proctoring_media (expires_at)
  where expires_at is not null;

-- Register snapshot/media after storage upload (student)
create or replace function public.lms_register_proctoring_media(
  p_attempt_id uuid,
  p_storage_path text,
  p_capture_reason text,
  p_event_id uuid default null,
  p_mime_type text default null,
  p_byte_size bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  a public.lms_test_attempts%rowtype;
  v_student uuid := auth.uid();
  v_id uuid;
  v_days int := 90;
begin
  if v_student is null then raise exception 'Not authenticated'; end if;
  if p_storage_path is null or length(trim(p_storage_path)) = 0 then
    raise exception 'storage_path required';
  end if;
  if p_capture_reason is null or length(trim(p_capture_reason)) = 0 then
    raise exception 'capture_reason required';
  end if;

  select * into a from public.lms_test_attempts where id = p_attempt_id;
  if not found or a.student_id <> v_student then
    raise exception 'Attempt not found';
  end if;

  select coalesce(retention_days, 90) into v_days
  from public.lms_proctoring_policies
  where active = true
  order by created_at desc
  limit 1;

  insert into public.lms_test_proctoring_media (
    attempt_id, test_id, student_id, event_id,
    capture_reason, storage_path, mime_type, byte_size, expires_at
  ) values (
    a.id, a.test_id, v_student, p_event_id,
    trim(p_capture_reason), trim(p_storage_path), p_mime_type, p_byte_size,
    now() + make_interval(days => greatest(v_days, 1))
  ) returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.lms_register_proctoring_media(uuid, text, text, uuid, text, bigint) to authenticated;

-- List expired media paths for cleanup (admin/mentor service via API with admin client)
create or replace function public.lms_list_expired_proctoring_media(p_limit int default 200)
returns table (
  media_id uuid,
  storage_path text,
  captured_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  return query
  select m.id, m.storage_path, m.captured_at, m.expires_at
  from public.lms_test_proctoring_media m
  where m.expires_at is not null and m.expires_at < now()
  order by m.expires_at asc
  limit greatest(coalesce(p_limit, 200), 1);
end;
$$;

grant execute on function public.lms_list_expired_proctoring_media(int) to authenticated;

create or replace function public.lms_delete_proctoring_media_rows(p_media_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  if p_media_ids is null or coalesce(array_length(p_media_ids, 1), 0) = 0 then
    return 0;
  end if;
  delete from public.lms_test_proctoring_media where id = any (p_media_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.lms_delete_proctoring_media_rows(uuid[]) to authenticated;

-- Mentor may update review_status on media for tests they assigned
drop policy if exists lms_proctoring_media_mentor_update on public.lms_test_proctoring_media;
create policy lms_proctoring_media_mentor_update on public.lms_test_proctoring_media
  for update to authenticated
  using (
    public.is_mentor_role()
    and exists (
      select 1 from public.lms_tests t
      where t.id = test_id
        and (
          t.assigned_by = auth.uid()
          or public.lms_mentor_has_active_allocation(auth.uid(), t.department_id, t.course_id, t.batch_id, t.module_id)
        )
    )
  )
  with check (
    public.is_mentor_role()
    and exists (
      select 1 from public.lms_tests t
      where t.id = test_id
        and (
          t.assigned_by = auth.uid()
          or public.lms_mentor_has_active_allocation(auth.uid(), t.department_id, t.course_id, t.batch_id, t.module_id)
        )
    )
  );

-- Broaden mentor read of events/media to allocation scope (not only assigned_by)
drop policy if exists lms_proctoring_events_mentor on public.lms_test_proctoring_events;
create policy lms_proctoring_events_mentor on public.lms_test_proctoring_events
  for select to authenticated
  using (
    public.is_mentor_role()
    and exists (
      select 1 from public.lms_tests t
      where t.id = test_id
        and (
          t.assigned_by = auth.uid()
          or public.lms_mentor_has_active_allocation(auth.uid(), t.department_id, t.course_id, t.batch_id, t.module_id)
        )
    )
  );

drop policy if exists lms_proctoring_media_mentor on public.lms_test_proctoring_media;
create policy lms_proctoring_media_mentor on public.lms_test_proctoring_media
  for select to authenticated
  using (
    public.is_mentor_role()
    and exists (
      select 1 from public.lms_tests t
      where t.id = test_id
        and (
          t.assigned_by = auth.uid()
          or public.lms_mentor_has_active_allocation(auth.uid(), t.department_id, t.course_id, t.batch_id, t.module_id)
        )
    )
  );

comment on function public.lms_register_proctoring_media is
  'Student registers a private test-proctoring snapshot path after upload.';
comment on function public.lms_list_expired_proctoring_media is
  'Admin lists expired proctoring media for storage purge job.';

-- SEB: security_mode already supports safe_exam_browser on lms_tests (lms_tests_core.sql).
-- Full SEB config/quit-password integration is out of band; app enforces soft UA/check only.
