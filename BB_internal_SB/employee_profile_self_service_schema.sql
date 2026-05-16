-- Employee profile self-service (personal, contact, documents).
-- Run AFTER schema.sql and rls-policies.sql.

alter table public.employee_details add column if not exists joined_at date;
alter table public.employee_details add column if not exists employment_type text default 'Full-time';

create table if not exists public.employee_profile_details (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,

  profile_photo_url text,
  preferred_name text,
  date_of_birth date,
  gender text,
  blood_group text,
  marital_status text,
  nationality text,
  personal_email text,
  bio text,

  personal_mobile text,
  alternate_mobile text,

  current_address_line1 text,
  current_address_line2 text,
  current_city text,
  current_state text,
  current_pincode text,
  current_country text,

  same_as_current boolean not null default false,
  permanent_address_line1 text,
  permanent_address_line2 text,
  permanent_city text,
  permanent_state text,
  permanent_pincode text,
  permanent_country text,

  emergency_contact_1_name text,
  emergency_contact_1_relationship text,
  emergency_contact_1_phone text,
  emergency_contact_1_alt_phone text,
  emergency_contact_1_address text,
  emergency_contact_2_name text,
  emergency_contact_2_relationship text,
  emergency_contact_2_phone text,
  emergency_contact_2_alt_phone text,
  emergency_contact_2_address text,

  skills jsonb not null default '[]'::jsonb,
  tools_known jsonb not null default '[]'::jsonb,
  certifications jsonb not null default '[]'::jsonb,
  languages_known jsonb not null default '[]'::jsonb,
  years_of_experience numeric,
  previous_company text,
  portfolio_url text,
  linkedin_url text,
  github_url text,
  behance_url text,
  website_url text,

  bank_name text,
  account_holder_name text,
  account_number text,
  ifsc_code text,
  branch_name text,
  upi_id text,
  pan_number text,
  aadhaar_number text,
  passport_number text,

  preferred_work_mode text,
  preferred_communication_channel text,
  notification_preferences jsonb not null default '{}'::jsonb,
  preferred_language text,

  profile_completion integer not null default 0,
  last_updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_profile_details_profile_id_idx on public.employee_profile_details (profile_id);

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null,
  document_name text not null,
  document_url text not null,
  storage_path text not null,
  verification_status text not null default 'Pending',
  uploaded_by uuid references public.profiles(id) on delete set null,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create index if not exists employee_documents_profile_id_idx on public.employee_documents (profile_id, created_at desc);

create or replace function public.employee_profile_details_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employee_profile_details_updated_at on public.employee_profile_details;
create trigger employee_profile_details_updated_at
before update on public.employee_profile_details
for each row execute function public.employee_profile_details_set_updated_at();

alter table public.employee_profile_details enable row level security;
alter table public.employee_documents enable row level security;

-- employee_profile_details
drop policy if exists employee_profile_details_select_own on public.employee_profile_details;
create policy employee_profile_details_select_own
on public.employee_profile_details for select to authenticated
using (profile_id = auth.uid());

drop policy if exists employee_profile_details_insert_own on public.employee_profile_details;
create policy employee_profile_details_insert_own
on public.employee_profile_details for insert to authenticated
with check (profile_id = auth.uid());

drop policy if exists employee_profile_details_update_own on public.employee_profile_details;
create policy employee_profile_details_update_own
on public.employee_profile_details for update to authenticated
using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists employee_profile_details_admin_all on public.employee_profile_details;
create policy employee_profile_details_admin_all
on public.employee_profile_details for all to authenticated
using (public.is_admin()) with check (public.is_admin());

-- employee_documents
drop policy if exists employee_documents_select_own on public.employee_documents;
create policy employee_documents_select_own
on public.employee_documents for select to authenticated
using (profile_id = auth.uid());

drop policy if exists employee_documents_insert_own on public.employee_documents;
create policy employee_documents_insert_own
on public.employee_documents for insert to authenticated
with check (profile_id = auth.uid() and uploaded_by = auth.uid());

drop policy if exists employee_documents_update_own on public.employee_documents;
create policy employee_documents_update_own
on public.employee_documents for update to authenticated
using (profile_id = auth.uid() and verification_status is distinct from 'Verified')
with check (profile_id = auth.uid());

drop policy if exists employee_documents_admin_all on public.employee_documents;
create policy employee_documents_admin_all
on public.employee_documents for all to authenticated
using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.employee_profile_details to authenticated;
grant select, insert, update on public.employee_documents to authenticated;

-- Storage bucket (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-documents',
  'employee-documents',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]
)
on conflict (id) do update set public = false;

drop policy if exists employee_docs_storage_select on storage.objects;
create policy employee_docs_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'employee-documents'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists employee_docs_storage_insert on storage.objects;
create policy employee_docs_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists employee_docs_storage_update on storage.objects;
create policy employee_docs_storage_update
on storage.objects for update to authenticated
using (
  bucket_id = 'employee-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists employee_docs_storage_delete on storage.objects;
create policy employee_docs_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'employee-documents'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);
