-- Run after company_policies_schema.sql
-- Categories: employee (default) | freelancer

alter table public.company_policies
  add column if not exists policy_category text not null default 'employee';

alter table public.company_policies
  drop constraint if exists company_policies_category_check;

alter table public.company_policies
  add constraint company_policies_category_check
  check (policy_category in ('employee', 'freelancer'));

create index if not exists company_policies_category_idx
  on public.company_policies (policy_category, created_at desc);
