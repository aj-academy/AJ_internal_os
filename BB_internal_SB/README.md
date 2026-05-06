# BB Internal SB (Supabase Backend)

This folder stores production-safe Supabase backend assets for BB Internal OS Admin Console.

## Files

- `schema.sql` - core tables, helper functions, and RLS-enabled table setup
- `rls-policies.sql` - role-based Row Level Security policies
- `seed-users-guide.md` - Auth user creation and profile/employee seeding flow

## How to run `schema.sql`

1. Open Supabase Dashboard -> `SQL Editor`.
2. Create a new query.
3. Paste contents of `schema.sql`.
4. Run query and verify tables/functions are created:
   - `public.profiles`
   - `public.employee_details`
   - `public.audit_logs`
   - `public.system_settings`
   - `public.get_user_role()`
   - `public.is_admin()`

## How to run `rls-policies.sql`

1. In `SQL Editor`, open a new query.
2. Paste contents of `rls-policies.sql`.
3. Run query.
4. Confirm policies exist on:
   - `profiles`
   - `employee_details`
   - `audit_logs`
   - `system_settings`

The policy file is safe to re-run because it uses `drop policy if exists` before every create.

## How to create users

1. Create auth users in Supabase `Authentication -> Users`.
2. Copy each `auth.users.id` UUID.
3. Insert user profile records in `public.profiles` using the same UUID.
4. Insert employee mappings into `public.employee_details`.

See `seed-users-guide.md` for SQL templates and admin/manager/employee examples.

## Role meanings

- `super_admin`: highest privilege; full access across modules/settings.
- `admin`: full operational and management access.
- `manager`: team/assigned-employee level access.
- `employee`: self-only access.
- `accounts`: limited read access (finance/reports use cases).

## Security rules

- Keep RLS enabled on `public.profiles` at all times.
- Keep RLS enabled on `employee_details`, `audit_logs`, and `system_settings`.
- Never expose Supabase `service_role` key in frontend code.
- Use Supabase `anon` key in frontend and enforce access via RLS.
- Keep privileged automation (if any) in trusted server environments only.
- `audit_logs` is readable by `admin/super_admin`; client-side direct insert is blocked by default.
- `system_settings` is accessible only for `admin/super_admin` and denied to all other roles.
