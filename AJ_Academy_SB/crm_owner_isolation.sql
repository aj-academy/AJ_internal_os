-- Student Master + College Visits ownership for employee activity tracking
-- - Admin / super_admin: see and manage ALL employee CRM rows (tracking).
-- - Employee: only their own rows (assigned_to / created_by).
-- - Task-linked access still allows limited cross-user work without full CRM browse.
-- Run after employee_student_master_rls.sql, tasks_linked_lead_access.sql, college_visits_schema.sql.
-- Re-run after security_rls_access_fix.sql (which may reshape clients admin policies).
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
    where (t.assigned_to = auth.uid() or t.assigned_by = auth.uid())
      and exists (
        select 1
        from jsonb_array_elements_text(coalesce(t.college_visit_ids, '[]'::jsonb)) as elem(val)
        where lower(btrim(elem.val)) = lower(p_college_id::text)
      )
  );
$$;

grant execute on function public.task_links_college(uuid) to authenticated;

comment on function public.task_links_college(uuid) is
  'True when the current user is assignee/assigner of a college-linked task that includes this college visit id.';

-- ---------- clients (Student Master) ----------
drop policy if exists clients_admin_select_all on public.clients;
drop policy if exists clients_admin_update_all on public.clients;
drop policy if exists clients_admin_delete_all on public.clients;
drop policy if exists clients_admin_insert_all on public.clients;
drop policy if exists clients_admin_select_own on public.clients;
drop policy if exists clients_admin_insert_own on public.clients;
drop policy if exists clients_admin_update_own on public.clients;
drop policy if exists clients_admin_delete_own on public.clients;

-- Admin: full visibility for tracking every employee's leads
create policy clients_admin_select_all
on public.clients for select to authenticated
using (public.is_admin());

create policy clients_admin_insert_all
on public.clients for insert to authenticated
with check (public.is_admin());

create policy clients_admin_update_all
on public.clients for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy clients_admin_delete_all
on public.clients for delete to authenticated
using (public.is_admin());

-- Employees: own assigned leads only (never another employee's CRM)
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

create policy college_visits_admin_all
on public.college_visits for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Non-admin: own / created / task-linked only
create policy college_visits_select_own
on public.college_visits for select to authenticated
using (
  not public.is_admin()
  and (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or public.task_links_college(id)
  )
);

create policy college_visits_insert_own
on public.college_visits for insert to authenticated
with check (
  not public.is_admin()
  and created_by = auth.uid()
  and assigned_to = auth.uid()
);

create policy college_visits_update_own
on public.college_visits for update to authenticated
using (
  not public.is_admin()
  and (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or public.task_links_college(id)
  )
)
with check (
  not public.is_admin()
  and (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or public.task_links_college(id)
  )
);

create policy college_visits_delete_own
on public.college_visits for delete to authenticated
using (
  not public.is_admin()
  and (assigned_to = auth.uid() or created_by = auth.uid())
);

-- Activities: admin all; others only for visits they can see
drop policy if exists college_visit_activities_admin_all on public.college_visit_activities;
drop policy if exists college_visit_activities_employee_all on public.college_visit_activities;
drop policy if exists college_visit_activities_own on public.college_visit_activities;

create policy college_visit_activities_admin_all
on public.college_visit_activities for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy college_visit_activities_own
on public.college_visit_activities for all to authenticated
using (
  not public.is_admin()
  and exists (
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
  not public.is_admin()
  and exists (
    select 1 from public.college_visits v
    where v.id = college_visit_id
      and (
        v.assigned_to = auth.uid()
        or v.created_by = auth.uid()
        or public.task_links_college(v.id)
      )
  )
);
