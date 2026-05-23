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

## Step 4 (optional): employee_details

Only needed if you use extended profile fields in User Master:

```sql
insert into public.employee_details (profile_id, phone, joined_at)
values ('STUDENT-UUID-HERE', '+91-0000000000', current_date);
```

See **SUPABASE_SETUP_GUIDE.md** for full project setup.
