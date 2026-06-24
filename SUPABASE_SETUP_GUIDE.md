# AJ Academy — Supabase setup guide

**Frontend:** `AJ_Academy_OS` · **Database SQL:** `AJ_Academy_SB`

---

## Step 1 — Create Supabase project

[supabase.com/dashboard](https://supabase.com/dashboard) → **New project** → copy URL and API keys.

---

## Step 2 — Environment variables

In **`AJ_Academy_OS`**, copy `.env.example` → `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
RESEND_API_KEY=re_...
TASK_EMAIL_FROM="AJ Academy <onboarding@resend.dev>"
```

`RESEND_API_KEY` is optional, but required if you want counselling schedule emails to be sent to students.

---

## Step 3 — Auth URLs

**Authentication** → **URL configuration** → add `http://localhost:3000/auth/callback` and `/reset-password`.

---

## Step 4 — Run SQL

Run files from **`AJ_Academy_SB`** in order (`DATABASE_SETUP_ORDER.txt`):

1. `schema.sql`  
2. `attendance_module.sql`  
3. `attendance_selfie_schema.sql`  
4. `task_schema.sql`  
5. `aj_academy_roles_patch.sql`  
6. `task_notifications_columns.sql`  
7. `in_app_notifications.sql`  
8. **`profiles_rls_fix.sql`** (required — fixes login redirect loop)  
8d. **`counselling_sessions_patch.sql`** (re-run if Counselling page shows schema warning — adds/fixes `counselling_sessions` + columns)
8e. **`counselling_student_contact_schema.sql`** (legacy — columns are in patch + expansion)

Do **not** run `rls-policies.sql` (legacy Birthmark Brahma; blocks AJ Academy profiles).

---

## Step 5 — Create users

See `AJ_Academy_SB/seed-users-guide.md`.

---

## Step 6 — Run app

```bash
cd AJ_Academy_OS
npm install
npm run dev
```

Open `http://localhost:3000/login`.

---

## Login redirects back to `/login`?

1. Check the URL after redirect:
   - `?error=session` — browser did not keep auth cookies; restart `npm run dev`, clear site data for `localhost:3000`, sign in again.
   - `?error=missing_role` — no `profiles` row (or wrong `id`). Fix in SQL Editor:

```sql
-- Replace with your Auth user id and email from Authentication → Users
insert into public.profiles (id, full_name, email, role, status)
values ('YOUR-AUTH-USER-UUID', 'Admin', 'you@example.com', 'admin', 'active')
on conflict (id) do update set role = excluded.role, status = excluded.status, email = excluded.email;
```

2. Run **`profiles_rls_fix.sql`** if you have not already.
3. On the login form, pick the role that matches `profiles.role` (Admin → `admin` or `super_admin`).
4. Verify:

```sql
select id, email, role, status from public.profiles;
```

---

## Project layout

```
Desktop/AJ_Academy/
├── AJ_Academy_OS/      ← Next.js app
├── AJ_Academy_SB/      ← Supabase SQL
├── SUPABASE_SETUP_GUIDE.md
└── .git/
```

### Student portal (same modules as employee)

Students use `/student/*` with the same attendance (GPS + work summary), permission, leave, policies, and profile flows as employees. Also requires:

- **`aj_academy_platform_expansion.sql`** — `profiles.course`, `assigned_mentor_id`, counselling
- **`counselling_sessions_patch.sql`** — My Counselling page + dashboard notifications
- **`employee_module_schema.sql`** — permission + leave tables (shared RLS via `employee_id = auth.uid()`)
- **`company_policies_schema.sql`** (+ optional category patch) — policy gate on student layout

Set `course` / `department` / `assigned_mentor_id` on the student’s `profiles` row for the dashboard course & batch card.

### Freelancer portal

Freelancers now use `/freelancer/*` routes for attendance, **My Tasks** (tasks assigned to freelancer), **Assign Tasks** (department student assignment), and **My Profile**.  
Task popups + mood survey use the same tables/modules as employee (`in_app_notifications`, optional `employee_daily_mood_checkins`).

### Mentor portal

Mentors use `/mentor/*` for attendance, **Assign Tasks** (department students), counselling, **My Profile**, and a dashboard **student roster** (department batch + primary mentor flag). Task notification popups still open `/mentor/my-tasks` when admins assign work.  
Requires `aj_academy_platform_expansion.sql`, `mentor_department_tasks.sql`, and optional `employee_daily_mood_schema.sql` for mood popup.

If a leftover **`BB-internal-OS`** folder remains, close Cursor and any `npm run dev`, then delete that folder in File Explorer (it is an old duplicate).
