-- BB Internal OS — Finance & Expense Management
-- Run AFTER: schema.sql, student_lead_master_schema.sql (clients), project_master_schema.sql (projects + RLS helpers).
-- Path: AJ_Academy_SB/finance_schema.sql
--
-- Tables: finance_categories, finance_transactions, expense_claims, project_payments, finance_activities
-- Triggers: refresh projects.advance_paid / pending_amount from project_payments; auto expense tx on claim approval;
--           log finance_activities on income/expense inserts.
-- RLS: admin/accounts full; manager project-scoped; employee own claims only. Uses public.project_principal_has_access for managers (no recursion in finance policies).

create extension if not exists pgcrypto;

-- ------------------------------
-- finance_categories
-- ------------------------------

create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid (),
  category_name text not null,
  category_type text not null check (category_type in ('Income', 'Expense')),
  created_at timestamptz not null default now (),
  unique (category_name, category_type)
);

create index if not exists finance_categories_type_idx on public.finance_categories (category_type);

-- ------------------------------
-- finance_transactions
-- ------------------------------

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid (),
  transaction_code text,
  transaction_type text not null check (transaction_type in ('Income', 'Expense')),
  category text,
  amount numeric(14, 2) not null check (amount >= 0),
  payment_method text,
  payment_status text default 'Pending',
  transaction_date date not null default (current_date),
  project_id uuid references public.projects (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  employee_id uuid references public.profiles (id) on delete set null,
  description text,
  reference_number text,
  attachment_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index if not exists finance_transactions_type_idx on public.finance_transactions (transaction_type);
create index if not exists finance_transactions_date_idx on public.finance_transactions (transaction_date desc);
create index if not exists finance_transactions_project_idx on public.finance_transactions (project_id);
create index if not exists finance_transactions_client_idx on public.finance_transactions (client_id);

-- ------------------------------
-- expense_claims
-- ------------------------------

create table if not exists public.expense_claims (
  id uuid primary key default gen_random_uuid (),
  claim_code text,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  expense_type text,
  amount numeric(14, 2) not null check (amount >= 0),
  expense_date date not null default (current_date),
  payment_method text,
  receipt_url text,
  reason text,
  approval_status text not null default 'Pending' check (approval_status in ('Pending', 'Approved', 'Rejected')),
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index if not exists expense_claims_employee_idx on public.expense_claims (employee_id);
create index if not exists expense_claims_status_idx on public.expense_claims (approval_status);

-- ------------------------------
-- project_payments
-- ------------------------------

create table if not exists public.project_payments (
  id uuid primary key default gen_random_uuid (),
  project_id uuid not null references public.projects (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  amount numeric(14, 2) not null check (amount >= 0),
  payment_date date not null default (current_date),
  payment_method text,
  payment_status text not null default 'Pending' check (payment_status in ('Paid', 'Partial', 'Pending', 'Overdue')),
  invoice_number text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now ()
);

create index if not exists project_payments_project_idx on public.project_payments (project_id);
create index if not exists project_payments_client_idx on public.project_payments (client_id);
create index if not exists project_payments_date_idx on public.project_payments (payment_date desc);

-- ------------------------------
-- finance_activities
-- ------------------------------

create table if not exists public.finance_activities (
  id uuid primary key default gen_random_uuid (),
  activity_type text not null,
  reference_id uuid,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now ()
);

create index if not exists finance_activities_created_idx on public.finance_activities (created_at desc);

-- ------------------------------
-- updated_at triggers
-- ------------------------------

create or replace function public.finance_set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists finance_transactions_set_updated_at on public.finance_transactions;
create trigger finance_transactions_set_updated_at
before update on public.finance_transactions
for each row
execute function public.finance_set_updated_at ();

drop trigger if exists expense_claims_set_updated_at on public.expense_claims;
create trigger expense_claims_set_updated_at
before update on public.expense_claims
for each row
execute function public.finance_set_updated_at ();

-- ------------------------------
-- Refresh projects.advance_paid / pending_amount from project_payments
-- ------------------------------

create or replace function public.finance_refresh_project_from_payments (p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_budget numeric(14, 2);
  v_received numeric(14, 2);
begin
  if p_project_id is null then
    return;
  end if;

  select coalesce(budget, 0) into v_budget from public.projects where id = p_project_id;

  select coalesce(sum(amount), 0)
  into v_received
  from public.project_payments
  where
    project_id = p_project_id
    and payment_status in ('Paid', 'Partial');

  update public.projects
  set
    advance_paid = v_received,
    pending_amount = greatest(0::numeric, v_budget - v_received),
    updated_at = now()
  where
    id = p_project_id;
end;
$$;

create or replace function public.project_payments_touch_project ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if tg_op = 'DELETE' then
    v_old := old.project_id;
    if v_old is not null then
      perform public.finance_refresh_project_from_payments (v_old);
    end if;
    return old;
  end if;

  v_new := new.project_id;
  if tg_op = 'INSERT' then
    if v_new is not null then
      perform public.finance_refresh_project_from_payments (v_new);
    end if;
    return new;
  end if;

  v_old := old.project_id;
  v_new := new.project_id;
  if v_old is distinct from v_new then
    if v_old is not null then
      perform public.finance_refresh_project_from_payments (v_old);
    end if;
    if v_new is not null then
      perform public.finance_refresh_project_from_payments (v_new);
    end if;
  elsif v_new is not null
  and (
    old.amount is distinct from new.amount
    or old.payment_status is distinct from new.payment_status
  ) then
    perform public.finance_refresh_project_from_payments (v_new);
  end if;

  return new;
end;
$$;

drop trigger if exists project_payments_touch_project_trigger on public.project_payments;
create trigger project_payments_touch_project_trigger
after insert or update or delete on public.project_payments
for each row
execute function public.project_payments_touch_project ();

revoke all on function public.finance_refresh_project_from_payments (uuid) from public;

-- ------------------------------
-- Expense claim approved → finance_transactions + activity
-- ------------------------------

create or replace function public.expense_claims_after_approval ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_should_post boolean := false;
begin
  if new.approval_status <> 'Approved' then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.approval_status, '') = 'Approved' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_should_post := true;
  elsif tg_op = 'UPDATE' and coalesce(old.approval_status, '') <> 'Approved' then
    v_should_post := true;
  end if;

  if not v_should_post then
    return new;
  end if;

  v_code := 'CLM-' || to_char(now(), 'YYYYMMDD') || '-' || substr(replace(new.id::text, '-', ''), 1, 8);

  insert into public.finance_transactions (
    transaction_code,
    transaction_type,
    category,
    amount,
    payment_method,
    payment_status,
    transaction_date,
    employee_id,
    description,
    created_by
  )
  values (
    v_code,
    'Expense',
    coalesce(new.expense_type, 'Expense Claim'),
    new.amount,
    new.payment_method,
    'Paid',
    coalesce(new.expense_date, current_date),
    new.employee_id,
    coalesce(new.reason, ''),
    new.approved_by
  );

  return new;
end;
$$;

drop trigger if exists expense_claims_after_approval_trigger on public.expense_claims;
create trigger expense_claims_after_approval_trigger
after insert or update on public.expense_claims
for each row
execute function public.expense_claims_after_approval ();

-- ------------------------------
-- Log finance_activities on transaction insert
-- ------------------------------

create or replace function public.finance_transactions_log_activity ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.finance_activities (activity_type, reference_id, notes, created_by)
  values (
    lower(new.transaction_type) || '_added',
    new.id,
    coalesce(new.transaction_code, new.id::text) || ' · ' || coalesce(new.category, '') || ' · ' || new.amount::text,
    new.created_by
  );
  return new;
end;
$$;

drop trigger if exists finance_transactions_log_activity_trigger on public.finance_transactions;
create trigger finance_transactions_log_activity_trigger
after insert on public.finance_transactions
for each row
execute function public.finance_transactions_log_activity ();

-- ------------------------------
-- RLS helper: privileged finance roles (no cross-table recursion)
-- ------------------------------

create or replace function public.finance_is_privileged ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) in ('admin', 'super_admin', 'accounts', 'account')
  );
$$;

revoke all on function public.finance_is_privileged () from public;
grant execute on function public.finance_is_privileged () to authenticated;

-- ------------------------------
-- RLS: finance_categories
-- ------------------------------

alter table public.finance_categories enable row level security;

drop policy if exists "finance_categories_select_all" on public.finance_categories;
create policy "finance_categories_select_all"
on public.finance_categories
for select
to authenticated
using (true);

drop policy if exists "finance_categories_write_privileged" on public.finance_categories;
create policy "finance_categories_write_privileged"
on public.finance_categories
for all
to authenticated
using (public.finance_is_privileged ())
with check (public.finance_is_privileged ());

-- ------------------------------
-- RLS: finance_transactions
-- ------------------------------

alter table public.finance_transactions enable row level security;

drop policy if exists "finance_transactions_privileged_all" on public.finance_transactions;
create policy "finance_transactions_privileged_all"
on public.finance_transactions
for all
to authenticated
using (public.finance_is_privileged ())
with check (public.finance_is_privileged ());

drop policy if exists "finance_transactions_manager_select_project" on public.finance_transactions;
create policy "finance_transactions_manager_select_project"
on public.finance_transactions
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'manager'
  )
  and project_id is not null
  and public.project_principal_has_access (project_id)
);

-- ------------------------------
-- RLS: expense_claims
-- ------------------------------

alter table public.expense_claims enable row level security;

drop policy if exists "expense_claims_privileged_all" on public.expense_claims;
create policy "expense_claims_privileged_all"
on public.expense_claims
for all
to authenticated
using (public.finance_is_privileged ())
with check (public.finance_is_privileged ());

drop policy if exists "expense_claims_employee_own" on public.expense_claims;
create policy "expense_claims_employee_own"
on public.expense_claims
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'employee'
  )
  and employee_id = auth.uid ()
);

drop policy if exists "expense_claims_employee_insert" on public.expense_claims;
create policy "expense_claims_employee_insert"
on public.expense_claims
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'employee'
  )
  and employee_id = auth.uid ()
);

drop policy if exists "expense_claims_employee_update_own_pending" on public.expense_claims;
create policy "expense_claims_employee_update_own_pending"
on public.expense_claims
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'employee'
  )
  and employee_id = auth.uid ()
  and approval_status = 'Pending'
)
with check (
  employee_id = auth.uid ()
  and approval_status = 'Pending'
);

-- ------------------------------
-- RLS: project_payments
-- ------------------------------

alter table public.project_payments enable row level security;

drop policy if exists "project_payments_privileged_all" on public.project_payments;
create policy "project_payments_privileged_all"
on public.project_payments
for all
to authenticated
using (public.finance_is_privileged ())
with check (public.finance_is_privileged ());

drop policy if exists "project_payments_manager_select" on public.project_payments;
create policy "project_payments_manager_select"
on public.project_payments
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'manager'
  )
  and public.project_principal_has_access (project_id)
);

drop policy if exists "project_payments_manager_write" on public.project_payments;
create policy "project_payments_manager_write"
on public.project_payments
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'manager'
  )
  and public.project_principal_has_access (project_id)
);

drop policy if exists "project_payments_manager_update" on public.project_payments;
create policy "project_payments_manager_update"
on public.project_payments
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'manager'
  )
  and public.project_principal_has_access (project_id)
)
with check (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'manager'
  )
  and public.project_principal_has_access (project_id)
);

drop policy if exists "project_payments_manager_delete" on public.project_payments;
create policy "project_payments_manager_delete"
on public.project_payments
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'manager'
  )
  and public.project_principal_has_access (project_id)
);

-- ------------------------------
-- RLS: finance_activities
-- ------------------------------

alter table public.finance_activities enable row level security;

drop policy if exists "finance_activities_privileged_all" on public.finance_activities;
create policy "finance_activities_privileged_all"
on public.finance_activities
for all
to authenticated
using (public.finance_is_privileged ())
with check (public.finance_is_privileged ());

drop policy if exists "finance_activities_manager_select" on public.finance_activities;
create policy "finance_activities_manager_select"
on public.finance_activities
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and lower(coalesce(p.role, '')) = 'manager'
  )
);

-- ------------------------------
-- Seed categories (idempotent)
-- ------------------------------

insert into public.finance_categories (category_name, category_type)
values
  ('Project Payment', 'Income'),
  ('Advance Payment', 'Income'),
  ('Retainer', 'Income'),
  ('Consultation', 'Income'),
  ('Marketing Service', 'Income'),
  ('Website Development', 'Income'),
  ('Branding', 'Income'),
  ('Other', 'Income'),
  ('Office Rent', 'Expense'),
  ('Internet', 'Expense'),
  ('Electricity', 'Expense'),
  ('Software', 'Expense'),
  ('Marketing', 'Expense'),
  ('Employee Salary', 'Expense'),
  ('Travel', 'Expense'),
  ('Food', 'Expense'),
  ('Printing', 'Expense'),
  ('Hardware', 'Expense'),
  ('Miscellaneous', 'Expense')
on conflict (category_name, category_type) do nothing;

-- ------------------------------
-- Realtime (optional)
-- ------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'finance_transactions'
  ) then
    alter publication supabase_realtime add table public.finance_transactions;
  end if;

  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'expense_claims'
  ) then
    alter publication supabase_realtime add table public.expense_claims;
  end if;

  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'project_payments'
  ) then
    alter publication supabase_realtime add table public.project_payments;
  end if;

  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'finance_activities'
  ) then
    alter publication supabase_realtime add table public.finance_activities;
  end if;
end
$$;
