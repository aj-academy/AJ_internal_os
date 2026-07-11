-- Include employees in admin task assignee picker (safe to re-run)

create or replace function public.get_task_assignees()
returns table (
  id uuid,
  full_name text,
  email text,
  department text,
  role text
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.id, p.full_name, p.email, p.department, p.role
  from public.profiles p
  where lower(coalesce(p.status, 'active')) = 'active'
    and lower(coalesce(p.role, '')) in (
      'student', 'freelancer', 'mentor', 'employee', 'admin', 'super_admin', 'manager'
    )
  order by p.role nulls last, p.full_name nulls last;
$$;

grant execute on function public.get_task_assignees() to authenticated;
