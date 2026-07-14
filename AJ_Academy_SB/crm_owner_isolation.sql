-- Per-user Student Master + College Visits ownership
-- Each user (admin and employee) only sees their own CRM rows.
-- Sharing happens via tasks (task_links_client / task_links_college).
-- Run after employee_student_master_rls.sql, tasks_linked_lead_access.sql, college_visits_schema.sql.
-- Safe to re-run.

-- ---------- helpers ----------
create or replace function public.task_links_college(p_college_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.tasks t
    where coalesce(t.assignment_type, '') = 'college'
      and (
        t.assigned_to = auth.uid()
        or t.assigned_by = auth.uid()
      )
      and t.college_visit_ids @> jsonb_build_array(p_college_id::text)
  );
$$;

grant execute on function public.task_links_college(uuid) to authenticated;

comment on function public.task_links_college(uuid) is
  'True when the current user is assignee/assigner of a college-linked task that includes this college visit id.';

-- ---------- clients (Student Master) ----------
-- Replace blanket admin SELECT/UPDATE/DELETE with owner-only (+ task-linked read/update for assignees)

drop policy if exists clients_admin_select_all on public.clients;
drop policy if exists clients_admin_update_all on public.clients;
drop policy if exists clients_admin_delete_all on public.clients;
drop policy if exists clients_admin_insert_all on public.clients;
drop policy if exists clients_admin_select_own on public.clients;
drop policy if exists clients_admin_insert_own on public.clients;
drop policy if exists clients_admin_update_own on public.clients;
drop policy if exists clients_admin_delete_own on public.clients;

create policy clients_admin_select_own
on public.clients for select to authenticated
using (
  public.is_admin()
  and (
    assigned_to = auth.uid()
    or public.task_links_client(id)
  )
);

create policy clients_admin_insert_own
on public.clients for insert to authenticated
with check (
  public.is_admin()
  and assigned_to = auth.uid()
  and (assigned_by is null or assigned_by = auth.uid())
);

create policy clients_admin_update_own
on public.clients for update to authenticated
using (
  public.is_admin()
  and (
    assigned_to = auth.uid()
    or public.task_links_client(id)
  )
)
with check (
  public.is_admin()
  and (
    assigned_to = auth.uid()
    or public.task_links_client(id)
  )
);

create policy clients_admin_delete_own
on public.clients for delete to authenticated
using (public.is_admin() and assigned_to = auth.uid());

-- Employees: keep assigned-only + task-linked (from prior scripts). Reaffirm select assigned.
drop policy if exists clients_employee_select_assigned on public.clients;
create policy clients_employee_select_assigned
on public.clients for select to authenticated
using (public.is_employee() and assigned_to = auth.uid());

-- ---------- college_visits ----------
drop policy if exists college_visits_admin_all on public.college_visits;
drop policy if exists college_visits_employee_all on public.college_visits;
drop policy if exists college_visits_select_own on public.college_visits;
drop policy if exists college_visits_insert_own on public.college_visits;
drop policy if exists college_visits_update_own on public.college_visits;
drop policy if exists college_visits_delete_own on public.college_visits;
drop policy if exists college_visits_select_task_linked on public.college_visits;
drop policy if exists college_visits_update_task_linked on public.college_visits;

create policy college_visits_select_own
on public.college_visits for select to authenticated
using (
  assigned_to = auth.uid()
  or created_by = auth.uid()
  or public.task_links_college(id)
);

create policy college_visits_insert_own
on public.college_visits for insert to authenticated
with check (
  created_by = auth.uid()
  and assigned_to = auth.uid()
);

create policy college_visits_update_own
on public.college_visits for update to authenticated
using (
  assigned_to = auth.uid()
  or created_by = auth.uid()
  or public.task_links_college(id)
)
with check (
  assigned_to = auth.uid()
  or created_by = auth.uid()
  or public.task_links_college(id)
);

create policy college_visits_delete_own
on public.college_visits for delete to authenticated
using (assigned_to = auth.uid() or created_by = auth.uid());

-- Activities: only for visits the user can see
drop policy if exists college_visit_activities_admin_all on public.college_visit_activities;
drop policy if exists college_visit_activities_employee_all on public.college_visit_activities;
drop policy if exists college_visit_activities_own on public.college_visit_activities;

create policy college_visit_activities_own
on public.college_visit_activities for all to authenticated
using (
  exists (
    select 1 from public.college_visits v
    where v.id = college_visit_id
      and (
        v.assigned_to = auth.uid()
        or v.created_by = auth.uid()
        or public.task_links_college(v.id)
      )
  )
)
with check (
  exists (
    select 1 from public.college_visits v
    where v.id = college_visit_id
      and (
        v.assigned_to = auth.uid()
        or v.created_by = auth.uid()
        or public.task_links_college(v.id)
      )
  )
);
