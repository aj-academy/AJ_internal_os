# AJ Academy — Seed users guide

## Step 1: Create user in Supabase Authentication

Dashboard → **Authentication** → **Users** → **Add user** (email + password).

## Step 2: Copy UUID

Copy the user `id` from `auth.users`.

## Step 3: Insert into profiles

```sql
insert into public.profiles (id, full_name, email, role, department, designation, status)
values
  ('ADMIN-UUID-HERE', 'Admin', 'admin@ajacademy.com', 'admin', 'Operations', 'Administrator', 'active'),
  ('STUDENT-UUID-HERE', 'Student One', 'student@ajacademy.com', 'student', 'Batch A', 'Student', 'active'),
  ('FREELANCER-UUID-HERE', 'Freelancer One', 'freelancer@ajacademy.com', 'freelancer', 'Remote', 'Freelancer', 'active'),
  ('MENTOR-UUID-HERE', 'Mentor One', 'mentor@ajacademy.com', 'mentor', 'Faculty', 'Mentor', 'active');
```

Valid roles: `super_admin`, `admin`, `student`, `freelancer`, `mentor`.

## Step 3b: Role column (not in Authentication → Users)

Supabase **Authentication → Users** has no `role` column. Roles live in **`public.profiles.role`**.

After creating users in Authentication, run **`add_role_and_sync_profiles.sql`** once. It:

- Ensures the `role` column exists on `profiles`
- Creates a profile row for every Auth user (with `role` filled)
- Sets `admin` for `admin123@gmail.com` and `adminuser@gmail.com` (edit emails in the file if needed)

View roles: **Table Editor → profiles** or:

```sql
select id, email, role, status from public.profiles;
```

## Step 4: Run profiles RLS fix

In SQL Editor, run **`profiles_rls_fix.sql`** once (after `schema.sql` / `attendance_module.sql`). This prevents the app from sending you back to login after a successful sign-in.

## Step 5 (optional): employee_details

Only needed if you use extended profile fields in User Master:

```sql
insert into public.employee_details (profile_id, phone, joined_at)
values ('STUDENT-UUID-HERE', '+91-0000000000', current_date);
```

See **SUPABASE_SETUP_GUIDE.md** for full project setup.
