-- Reimbursements module (BB OS parity) — run after finance_schema.sql

alter table public.expense_claims
  add column if not exists category text,
  add column if not exists budget_type text default 'Low Budget';

alter table public.expense_claims drop constraint if exists expense_claims_approval_status_check;
alter table public.expense_claims
  add constraint expense_claims_approval_status_check
  check (
    approval_status in (
      'Pending',
      'Approved',
      'Rejected',
      'Special Approval Required',
      'Reimbursed'
    )
  );

create table if not exists public.reimbursement_policy_settings (
  id uuid primary key default gen_random_uuid (),
  low_budget_limit numeric(14, 2) not null default 300,
  standard_limit numeric(14, 2) not null default 1000,
  allow_special_approval boolean not null default true,
  max_file_size_mb integer not null default 5,
  processing_days integer not null default 7,
  approval_required boolean not null default true,
  allowed_categories text not null default 'Travel, Food, Client Meeting, Office Purchase, Internet, Software, Printing',
  updated_at timestamptz not null default now ()
);

insert into public.reimbursement_policy_settings (id)
select gen_random_uuid ()
where not exists (select 1 from public.reimbursement_policy_settings limit 1);

alter table public.reimbursement_policy_settings enable row level security;

grant select, insert, update, delete on public.reimbursement_policy_settings to authenticated;

drop policy if exists reimbursement_policy_admin_all on public.reimbursement_policy_settings;
create policy reimbursement_policy_admin_all on public.reimbursement_policy_settings
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists reimbursement_policy_member_read on public.reimbursement_policy_settings;
create policy reimbursement_policy_member_read on public.reimbursement_policy_settings
for select to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('employee', 'mentor', 'freelancer')
  )
);
