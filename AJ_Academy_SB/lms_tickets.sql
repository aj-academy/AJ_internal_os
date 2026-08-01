-- =============================================================================
-- LMS Phase 16 — Student queries & complaints
-- Run after: lms_mentor_allocations.sql
-- Safe to re-run.
-- =============================================================================

create table if not exists public.lms_student_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null,
  student_id uuid not null references public.profiles (id) on delete cascade,
  category text not null
    check (category in (
      'assignment_clarification', 'project_clarification', 'test_issue', 'study_material_issue',
      'course_content', 'mentor_support', 'grade_clarification',
      'attendance', 'fees', 'certificate', 'technical', 'faculty_concern',
      'infrastructure', 'harassment_sensitive', 'other'
    )),
  subcategory text,
  subject text not null,
  description text not null,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  department_id uuid references public.academic_departments (id) on delete set null,
  course_id uuid references public.academic_courses (id) on delete set null,
  related_assignment_id uuid references public.lms_assignments (id) on delete set null,
  related_project_id uuid references public.lms_projects (id) on delete set null,
  related_material_id uuid references public.lms_study_materials (id) on delete set null,
  assigned_to uuid references public.profiles (id) on delete set null,
  is_confidential boolean not null default false,
  anonymous_to_mentor boolean not null default false,
  is_sensitive boolean not null default false,
  status text not null default 'open'
    check (status in (
      'open', 'assigned', 'in_review', 'waiting_for_student', 'escalated',
      'resolved', 'reopened', 'closed', 'rejected'
    )),
  first_response_at timestamptz,
  resolution_at timestamptz,
  satisfaction_rating integer check (satisfaction_rating is null or satisfaction_rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  constraint lms_student_tickets_number_unique unique (ticket_number)
);

create index if not exists lms_student_tickets_student_idx on public.lms_student_tickets (student_id);
create index if not exists lms_student_tickets_assigned_idx on public.lms_student_tickets (assigned_to);
create index if not exists lms_student_tickets_status_idx on public.lms_student_tickets (status);
create index if not exists lms_student_tickets_sensitive_idx on public.lms_student_tickets (is_sensitive)
  where is_sensitive = true;

drop trigger if exists lms_student_tickets_touch on public.lms_student_tickets;
create trigger lms_student_tickets_touch
  before update on public.lms_student_tickets
  for each row execute function public.lms_touch_updated_at();

create table if not exists public.lms_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.lms_student_tickets (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  is_internal_note boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists lms_ticket_messages_ticket_idx
  on public.lms_ticket_messages (ticket_id, created_at);

create table if not exists public.lms_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.lms_student_tickets (id) on delete cascade,
  message_id uuid references public.lms_ticket_messages (id) on delete set null,
  uploaded_by uuid not null references public.profiles (id) on delete cascade,
  file_path text not null,
  file_name text,
  file_mime text,
  file_size_bytes bigint,
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('query-attachments', 'query-attachments', false)
on conflict (id) do update set public = excluded.public;

create or replace function public.lms_next_ticket_number()
returns text
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_n bigint;
begin
  select count(*) + 1 into v_n from public.lms_student_tickets;
  return 'TKT-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_n::text, 4, '0');
end;
$$;

grant execute on function public.lms_next_ticket_number() to authenticated;

-- Sensitive tickets: only admin/super_admin (via is_admin)
create or replace function public.lms_can_view_ticket(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.lms_student_tickets t
    where t.id = p_ticket_id
      and (
        public.is_admin()
        or (t.student_id = auth.uid() and not (t.is_sensitive and false)) -- student always sees own
        or (
          not t.is_sensitive
          and t.assigned_to = auth.uid()
        )
        or (
          not t.is_sensitive
          and public.is_mentor_role()
          and t.department_id is not null
          and public.lms_mentor_has_active_allocation(auth.uid(), t.department_id, t.course_id, null, null)
          and not t.anonymous_to_mentor
        )
      )
  );
$$;

grant execute on function public.lms_can_view_ticket(uuid) to authenticated;

alter table public.lms_student_tickets enable row level security;
alter table public.lms_ticket_messages enable row level security;
alter table public.lms_ticket_attachments enable row level security;

grant select, insert, update on public.lms_student_tickets to authenticated;
grant select, insert on public.lms_ticket_messages to authenticated;
grant select, insert on public.lms_ticket_attachments to authenticated;

drop policy if exists lms_student_tickets_admin_all on public.lms_student_tickets;
create policy lms_student_tickets_admin_all on public.lms_student_tickets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_student_tickets_student_rw on public.lms_student_tickets;
create policy lms_student_tickets_student_rw on public.lms_student_tickets
  for all to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- Mentors: non-sensitive tickets assigned or in allocation scope
drop policy if exists lms_student_tickets_mentor_select on public.lms_student_tickets;
create policy lms_student_tickets_mentor_select on public.lms_student_tickets
  for select to authenticated
  using (
    public.is_mentor_role()
    and is_sensitive = false
    and (
      assigned_to = auth.uid()
      or (
        department_id is not null
        and not anonymous_to_mentor
        and public.lms_mentor_has_active_allocation(auth.uid(), department_id, course_id, null, null)
      )
    )
  );

drop policy if exists lms_student_tickets_mentor_update on public.lms_student_tickets;
create policy lms_student_tickets_mentor_update on public.lms_student_tickets
  for update to authenticated
  using (
    public.is_mentor_role()
    and is_sensitive = false
    and assigned_to = auth.uid()
  )
  with check (
    public.is_mentor_role()
    and is_sensitive = false
    and assigned_to = auth.uid()
  );

drop policy if exists lms_ticket_messages_admin_all on public.lms_ticket_messages;
create policy lms_ticket_messages_admin_all on public.lms_ticket_messages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_ticket_messages_rw on public.lms_ticket_messages;
create policy lms_ticket_messages_rw on public.lms_ticket_messages
  for select to authenticated
  using (public.lms_can_view_ticket(ticket_id));

drop policy if exists lms_ticket_messages_insert on public.lms_ticket_messages;
create policy lms_ticket_messages_insert on public.lms_ticket_messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.lms_can_view_ticket(ticket_id)
    and (
      not is_internal_note
      or public.is_admin()
      or public.is_mentor_role()
    )
  );

drop policy if exists lms_ticket_attachments_admin_all on public.lms_ticket_attachments;
create policy lms_ticket_attachments_admin_all on public.lms_ticket_attachments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists lms_ticket_attachments_select on public.lms_ticket_attachments;
create policy lms_ticket_attachments_select on public.lms_ticket_attachments
  for select to authenticated
  using (public.lms_can_view_ticket(ticket_id));

drop policy if exists lms_ticket_attachments_insert on public.lms_ticket_attachments;
create policy lms_ticket_attachments_insert on public.lms_ticket_attachments
  for insert to authenticated
  with check (uploaded_by = auth.uid() and public.lms_can_view_ticket(ticket_id));

comment on table public.lms_student_tickets is 'Student queries & complaints. Sensitive tickets are admin-only.';
