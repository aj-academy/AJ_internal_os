-- Portfolio templates (admin) + student filled entries.
-- Depends on: schema.sql (profiles, is_admin).

create table if not exists public.portfolio_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Portfolio Template',
  template_format text not null default 'html'
    check (template_format in ('html', 'pdf')),
  html_content text,
  file_url text,
  placeholder_fields jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portfolio_templates_active_idx
  on public.portfolio_templates (is_active)
  where is_active = true;

create table if not exists public.student_portfolio_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid not null references public.portfolio_templates (id) on delete cascade,
  field_values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (student_id, template_id)
);

create index if not exists student_portfolio_entries_student_idx
  on public.student_portfolio_entries (student_id);

create or replace function public.portfolio_templates_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists portfolio_templates_set_updated_at_trigger on public.portfolio_templates;
create trigger portfolio_templates_set_updated_at_trigger
before update on public.portfolio_templates
for each row execute function public.portfolio_templates_set_updated_at();

create or replace function public.student_portfolio_entries_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists student_portfolio_entries_set_updated_at_trigger on public.student_portfolio_entries;
create trigger student_portfolio_entries_set_updated_at_trigger
before update on public.student_portfolio_entries
for each row execute function public.student_portfolio_entries_set_updated_at();

-- Only one active template at a time
create or replace function public.portfolio_templates_single_active()
returns trigger language plpgsql as $$
begin
  if new.is_active then
    update public.portfolio_templates
    set is_active = false
    where is_active = true and id <> new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists portfolio_templates_single_active_trigger on public.portfolio_templates;
create trigger portfolio_templates_single_active_trigger
before insert or update of is_active on public.portfolio_templates
for each row execute function public.portfolio_templates_single_active();

-- Storage bucket for uploaded HTML/PDF templates
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio-templates',
  'portfolio-templates',
  true,
  5242880,
  array['text/html', 'application/pdf', 'application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.portfolio_templates enable row level security;
alter table public.student_portfolio_entries enable row level security;

grant select, insert, update, delete on public.portfolio_templates to authenticated;
grant select, insert, update, delete on public.student_portfolio_entries to authenticated;

drop policy if exists portfolio_templates_admin_all on public.portfolio_templates;
create policy portfolio_templates_admin_all on public.portfolio_templates
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists portfolio_templates_student_read_active on public.portfolio_templates;
create policy portfolio_templates_student_read_active on public.portfolio_templates
for select to authenticated
using (
  is_active = true
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and lower(coalesce(p.role, '')) = 'student'
  )
);

drop policy if exists student_portfolio_entries_own on public.student_portfolio_entries;
create policy student_portfolio_entries_own on public.student_portfolio_entries
for all to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

drop policy if exists student_portfolio_entries_admin_read on public.student_portfolio_entries;
create policy student_portfolio_entries_admin_read on public.student_portfolio_entries
for select to authenticated
using (public.is_admin());

-- Storage policies
drop policy if exists portfolio_templates_storage_read on storage.objects;
create policy portfolio_templates_storage_read on storage.objects
for select to authenticated
using (bucket_id = 'portfolio-templates');

drop policy if exists portfolio_templates_storage_admin_write on storage.objects;
create policy portfolio_templates_storage_admin_write on storage.objects
for all to authenticated
using (
  bucket_id = 'portfolio-templates'
  and public.is_admin()
)
with check (
  bucket_id = 'portfolio-templates'
  and public.is_admin()
);
