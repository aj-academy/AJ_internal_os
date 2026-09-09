-- Employee who uploaded a College Visits folder can see and update every college
-- in that folder (including rows Admin later saved into it). Employees still
-- cannot see Admin-owned folders. Safe to re-run.
-- Run after college_visit_file_visibility_patch.sql and college_visit_import_batches.sql.

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
        or (
          cv.import_batch_id is not null
          and exists (
            select 1
            from public.college_visit_import_batches b
            where b.id = cv.import_batch_id
              and b.uploaded_by = auth.uid()
          )
        )
      )
  );
$$;

revoke all on function public.can_access_college_visit(uuid) from public;
grant execute on function public.can_access_college_visit(uuid) to authenticated;

drop policy if exists college_visits_select_own on public.college_visits;
create policy college_visits_select_own
on public.college_visits for select to authenticated
using (
  not public.is_admin()
  and (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or public.task_links_college(id)
    or (
      import_batch_id is not null
      and exists (
        select 1
        from public.college_visit_import_batches b
        where b.id = college_visits.import_batch_id
          and b.uploaded_by = auth.uid()
      )
    )
  )
);

drop policy if exists college_visits_update_own on public.college_visits;
create policy college_visits_update_own
on public.college_visits for update to authenticated
using (
  not public.is_admin()
  and (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or public.task_links_college(id)
    or (
      import_batch_id is not null
      and exists (
        select 1
        from public.college_visit_import_batches b
        where b.id = college_visits.import_batch_id
          and b.uploaded_by = auth.uid()
      )
    )
  )
)
with check (
  not public.is_admin()
  and (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or public.task_links_college(id)
    or (
      import_batch_id is not null
      and exists (
        select 1
        from public.college_visit_import_batches b
        where b.id = college_visits.import_batch_id
          and b.uploaded_by = auth.uid()
      )
    )
  )
);

commit;
