# Seed Users Guide

Use this process for every user so Supabase Auth and app data remain mapped correctly.

## Step 1: Create user in Supabase Authentication

In Supabase Dashboard, go to `Authentication -> Users` and create the user account.

## Step 2: Copy UUID

Copy the `id` from the new user in `auth.users`. This UUID is the source of truth.

## Step 3: Insert into profiles

Insert into `public.profiles` using the same UUID from `auth.users.id`:

```sql
insert into public.profiles (
  id,
  full_name,
  email,
  role,
  department,
  designation,
  status
)
values
  ('11111111-1111-1111-1111-111111111111', 'Admin User', 'admin@bbinternal.com', 'admin', 'Operations', 'System Admin', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'Manager User', 'manager@bbinternal.com', 'manager', 'Engineering', 'Engineering Manager', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'Employee User', 'employee@bbinternal.com', 'employee', 'Engineering', 'Software Engineer', 'active');
```

## Step 4: Insert into employee_details

Insert employee metadata and manager assignment:

```sql
insert into public.employee_details (
  employee_id,
  manager_id,
  employee_code,
  phone,
  joined_at
)
values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'MGR-001', '+91-9000000001', '2024-01-10'),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'EMP-001', '+91-9000000002', '2024-02-15');
```

## Role examples

- `admin`: full operational access to admin console modules.
- `manager`: can access assigned employees/team records.
- `employee`: only self-level access.

## Important notes

- Keep `public.profiles.id` exactly equal to `auth.users.id`.
- Never use Supabase `service_role` in frontend clients.
- Run all normal app queries as authenticated users so RLS is enforced.
