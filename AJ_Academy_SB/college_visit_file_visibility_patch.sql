-- AJ OS College Visit file visibility and activity privacy.
-- Run after college_visits_schema.sql, crm_owner_isolation.sql,
-- proposals_file_upload_patch.sql, and proposals_multi_file_patch.sql.
-- Safe to re-run.

begin;

create or replace function public.can_access_college_visit(p_college_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.college_visits cv
    where cv.id = p_college_visit_id
      and (
        public.is_admin()
        or cv.assigned_to = auth.uid()
        or cv.created_by = auth.uid()
        or public.task_links_college(cv.id)
      )
  );
$$;

revoke all on function public.can_access_college_visit(uuid) from public;
grant execute on function public.can_access_college_visit(uuid) to authenticated;

alter table public.proposal_files
  add column if not exists visibility_scope text;

-- proposal_files is shared with Student Master; preserve its existing behavior.
update public.proposal_files
set visibility_scope = 'admin_employee'
where visibility_scope is null
  and entity_type = 'student';

-- Historical uploader roles were not snapshotted. Known Employee uploads can
-- remain shared; Admin and unknown uploads fail closed.
update public.proposal_files pf
set visibility_scope = case
  when exists (
    select 1
    from public.profiles p
    where p.id = pf.uploaded_by
      and lower(btrim(coalesce(p.role::text, ''))) = 'employee'
  ) then 'admin_employee'
  else 'admin_only'
end
where pf.visibility_scope is null
  and pf.entity_type = 'college';

-- Reconcile private legacy single-file metadata into the secured file table.
-- Uploader is unknown for rows that predate proposal_files, so these fail closed.
insert into public.proposal_files (
  entity_type,
  entity_id,
  file_name,
  file_path,
  file_type,
  file_size,
  uploaded_at,
  uploaded_by,
  visibility_scope
)
select
  'college',
  cv.id,
  coalesce(nullif(cv.proposal_file_name, ''), 'Proposal'),
  cv.proposal_file_path,
  cv.proposal_file_type,
  cv.proposal_file_size,
  coalesce(cv.proposal_uploaded_at, cv.updated_at, cv.created_at, now()),
  null,
  'admin_only'
from public.college_visits cv
where nullif(cv.proposal_file_path, '') is not null
on conflict (file_path) do nothing;

-- proposal_files is now canonical for College uploads. Clearing only the
-- private legacy mirror prevents direct Employee table reads from leaking an
-- Admin object's path. External proposal_link/proposal_pdf_url migration is
-- intentionally a separate controlled phase.
update public.college_visits cv
set
  proposal_file_name = null,
  proposal_file_path = null,
  proposal_file_type = null,
  proposal_file_size = null,
  proposal_uploaded_at = null
where nullif(cv.proposal_file_path, '') is not null
  and exists (
    select 1
    from public.proposal_files pf
    where pf.entity_type = 'college'
      and pf.entity_id = cv.id
      and pf.file_path = cv.proposal_file_path
  );

alter table public.proposal_files
  alter column visibility_scope set default 'admin_only';

alter table public.proposal_files
  alter column visibility_scope set not null;

do $$
begin
  alter table public.proposal_files
    add constraint proposal_files_visibility_scope_check
    check (visibility_scope in ('admin_only', 'admin_employee'));
exception
  when duplicate_object then null;
end $$;

create index if not exists proposal_files_college_visibility_idx
  on public.proposal_files (entity_id, visibility_scope, uploaded_at desc)
  where entity_type = 'college';

drop policy if exists proposal_files_staff_select on public.proposal_files;
drop policy if exists proposal_files_staff_insert on public.proposal_files;
drop policy if exists proposal_files_staff_delete on public.proposal_files;
drop policy if exists proposal_files_admin_all on public.proposal_files;
drop policy if exists proposal_files_employee_select_scoped on public.proposal_files;
drop policy if exists proposal_files_employee_insert_scoped on public.proposal_files;
drop policy if exists proposal_files_employee_delete_own on public.proposal_files;

create policy proposal_files_admin_all
on public.proposal_files
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy proposal_files_employee_select_scoped
on public.proposal_files
for select to authenticated
using (
  public.is_employee()
  and (
    entity_type = 'student'
    or (
      entity_type = 'college'
      and visibility_scope = 'admin_employee'
      and public.can_access_college_visit(entity_id)
    )
  )
);

create policy proposal_files_employee_insert_scoped
on public.proposal_files
for insert to authenticated
with check (
  public.is_employee()
  and uploaded_by = auth.uid()
  and visibility_scope = 'admin_employee'
  and (
    entity_type = 'student'
    or (
      entity_type = 'college'
      and public.can_access_college_visit(entity_id)
    )
  )
);

create policy proposal_files_employee_delete_own
on public.proposal_files
for delete to authenticated
using (
  public.is_employee()
  and uploaded_by = auth.uid()
  and visibility_scope = 'admin_employee'
  and (
    entity_type = 'student'
    or (
      entity_type = 'college'
      and public.can_access_college_visit(entity_id)
    )
  )
);

alter table public.college_visit_activities
  add column if not exists visibility_scope text;

update public.college_visit_activities
set visibility_scope = 'admin_employee'
where visibility_scope is null;

alter table public.college_visit_activities
  alter column visibility_scope set default 'admin_employee';

alter table public.college_visit_activities
  alter column visibility_scope set not null;

do $$
begin
  alter table public.college_visit_activities
    add constraint college_visit_activities_visibility_scope_check
    check (visibility_scope in ('admin_only', 'admin_employee'));
exception
  when duplicate_object then null;
end $$;

drop policy if exists college_visit_activities_own on public.college_visit_activities;
drop policy if exists college_visit_activities_employee_select_scoped on public.college_visit_activities;
drop policy if exists college_visit_activities_employee_insert_scoped on public.college_visit_activities;

create policy college_visit_activities_employee_select_scoped
on public.college_visit_activities
for select to authenticated
using (
  not public.is_admin()
  and visibility_scope = 'admin_employee'
  and public.can_access_college_visit(college_visit_id)
);

create policy college_visit_activities_employee_insert_scoped
on public.college_visit_activities
for insert to authenticated
with check (
  not public.is_admin()
  and visibility_scope = 'admin_employee'
  and created_by = auth.uid()
  and public.can_access_college_visit(college_visit_id)
);

commit;
