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
GMAIL_OUTREACH_USER=ajacademy.co.in@gmail.com
GMAIL_OUTREACH_APP_PASSWORD=your-gmail-app-password
OUTREACH_EMAIL_FROM="AJ Academy <ajacademy.co.in@gmail.com>"
```

`RESEND_API_KEY` is optional, but required if you want counselling schedule emails to be sent to students.

`GMAIL_OUTREACH_APP_PASSWORD` is required for Student Master outreach emails (sent from `ajacademy.co.in@gmail.com`). Create an [App Password](https://myaccount.google.com/apppasswords) on that Google account (2-Step Verification must be on).

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
8c. **`profiles_rls_tighten.sql`** (recommended — limits who can read other users' profiles)  
8f. **`security_rls_access_fix.sql`** (run if admin dashboard / Student Master show **0 records** after 8c — restores admin RLS on profiles, clients, tasks, projects, finance, attendance, Student Master aux tables)  
Security harness log: security/harness/SECURITY_HARNESS_LOG.txt
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

## Admin dashboard or Student Master shows 0 records?

Data is usually still in the database — Row Level Security (RLS) is blocking reads after `profiles_rls_tighten.sql` or `student_lead_master_rls_fix.sql`.

1. Confirm your login user has `role = 'admin'` or `'super_admin'` in `public.profiles`.
2. In Supabase **SQL Editor**, run **`AJ_Academy_SB/security_rls_access_fix.sql`** (safe to re-run).
3. Refresh the app. The admin dashboard now shows a red banner if RLS still blocks a table.

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

### Employee portal

Employees use `/employee/*` for attendance, **My Tasks** (assign tasks with leads/projects + attachments), **Student Master** (own assigned leads only), Lead Management, leave, reimbursement, and profile.

After Student Master SQL is applied, run **`employee_student_master_rls.sql`** so employees can select/update/insert **only leads assigned to them** (`assigned_to = auth.uid()`). Re-run this script if an older version granted blanket CRM access to all leads.

Then run **`crm_owner_isolation.sql`** so **employees only see their own** Student Master / College Visits rows, while **admins see every employee’s CRM** for activity tracking. Employees still cannot browse each other’s leads/colleges. Task-linked access remains for sharing specific rows via My Tasks. Re-run `crm_owner_isolation.sql` after `security_rls_access_fix.sql` if policies drift.

Then run **`crm_delete_fix.sql`** so deletes work (owned-row RPCs + cascade-safe employee delete policies; admin can delete any row). Re-run this script after updates: it also removes task `client_ids` links, CRM pins, and empty lead-assignment tasks when an admin deletes a lead, so employees no longer see ghost assigned leads. Without it, deletes often look successful but remove **0 rows** because child-table RLS blocks cascades.

If an employee sees **Forbidden** when saving a student, run (in order):

1. `student_lead_master_schema.sql` + `student_lead_master_aux_schema.sql` (if not already applied)
2. `security_rls_access_fix.sql`
3. **`employee_student_master_rls.sql`** — assigned-only employee CRM (create with self as assignee)
4. **`crm_owner_isolation.sql`** — employee own-only; admin sees all for tracking
5. **`crm_delete_fix.sql`** — deletes actually remove rows (RPC + cascade policies); also cleans task/pin links on lead delete

Then hard-refresh the app and try **Add Student** again.

**Attendance camera / location:** Employee layout shows a one-time popup asking for camera + location (saved in browser localStorage per user). `Permissions-Policy` must allow `camera=(self)` and `geolocation=(self)` (see `lib/security/headers.ts`). Restart the Next server after header changes.

### College Visits

Run **`college_visits_schema.sql`** after `schema.sql` (requires `is_admin()` / profiles), then **`college_visits_proposal_patch.sql`** (Proposal Tracker: link + PDF columns and `college-visit-proposals` storage bucket), then **`college_visits_contacts_patch.sql`** (multiple contacts: name / role / alternate phones / email JSON + primary sync), then **`college_visits_visited_by_patch.sql`** (adds `visited_by_name` for who visited), then **`proposals_file_upload_patch.sql`** (unified private `proposals` bucket + file columns on `clients` and `college_visits` for PDF/DOC/DOCX upload on Add/Edit), then **`crm_owner_isolation.sql`**, then **`crm_delete_fix.sql`**. Adds:

- `/admin/college-visits` and `/employee/college-visits` — **same subsection tabs as Student Master**: Overview, All Colleges, Follow-ups, Pipeline, Converted Colleges, MOU Tracker, **Proposal Tracker**, Activity Timeline (+ Reports / Settings for admin). **Admin sees all employees’ colleges**; **employees see only their own**. Share via College Visit tasks without opening another employee’s full CRM.
- **Settings tab (admin):** editable visit / MOU / proposal / final status lists persist to `system_settings` key `college_visits` via `/api/admin/settings`. Staff read via `/api/college-visits/lists` (same store as Admin → System Settings → College Visits). Dropdowns, filters, and Pipeline columns use those lists.
- **Import / Export CSV** includes primary contact plus **Contact 2 / Contact 3** (name, role, phone, alternate phone, email) and **Alternate Phone 2 / 3** on the primary — same multi-contact model as Add/Edit. Older single-contact CSVs still import.
- **Visit & MOU:** `Who visited` field is available on Add/Edit and saves to `college_visits.visited_by_name` for both admin and employee dashboards.
- Proposal Tracker / Add·Edit forms upload **PDF, DOC, or DOCX** (max 10 MB) into the private `proposals` bucket; legacy URL/PDF fields remain readable.
- Pick-for-task flow uses the **All Colleges** tab (same pattern as Student Master → All Students).

**Student Master proposals:** Same file upload (Add + Edit + Proposal Tracker) after `proposals_file_upload_patch.sql`. Paths: `students/{client_id}/…` and `colleges/{college_visit_id}/…`. APIs: `POST /api/proposals/upload`, `/signed-url`, `/remove` (staff session + service role).

API (staff session): `GET/POST /api/college-visits`, `PATCH/DELETE /api/college-visits/[id]`, `GET/POST /api/college-visits/[id]/activities`. GET returns **all rows for admin**, else the signed-in employee’s own rows.

**Task assignment:** In Assign Task, choose **Colleges** → open College Visits table to pick rows (same flow as Student Master leads). Run `tasks_college_link_patch.sql` after `college_visits_schema.sql`.

### Project Master

Run **`project_master_schema.sql`** after `schema.sql` and task schema (see `DATABASE_SETUP_ORDER.txt` step 9).

- `/admin/project-master` — Overview, All / Active / Completed / Delayed projects, Team Allocation, Timeline, Budget & Payments, Reports, **Settings**.
- **Settings tab:** editable project types, statuses, priorities, and default deadline (days) persist to `system_settings` key `project` via `/api/admin/settings`. Staff read via `/api/projects/lists` (same store as Admin → System Settings → Project defaults). Dropdowns and table filters use those lists. Only admins can save.

**Employee not seeing assigned tasks?** Run **`tasks_employee_rls_fix.sql`** — `aj_academy_roles_patch.sql` removed employee task SELECT policies; this restores them. Re-run the same script if **My Tasks → Delete selected** says permission denied (adds employee DELETE for tasks assigned to / by them).

**Employee Lead Contact shows “—” / “(limited)” / ID placeholders on My Tasks?** Deploy + re-run **`tasks_linked_lead_access.sql`**. Prefer the app path: `/api/tasks/linked-crm` (needs **`SUPABASE_SERVICE_ROLE_KEY`** on the server) loads full Student Master columns for leads linked on the user’s tasks. Also ensures `get_my_task_linked_clients` RPC matches `client_ids` reliably. If the lead was deleted by admin but the task remains, re-run **`crm_delete_fix.sql`** (cleans task links) or delete the orphan task after the employee DELETE policy is applied.

**Employee task notification opens wrong page / dashboard?** Run **`task_notification_employee_link_fix.sql`**. Older installs linked employees to `/student/my-tasks` (blocked by the student layout). The app also remaps those links client-side; the SQL fixes new notifications and backfills old ones.

**Pin Student Lead / College Visit into CRM (not Dashboard)?** Run **`employee_crm_pins.sql`** after `tasks_linked_lead_access.sql` + `crm_owner_isolation.sql`. From My Tasks → Student Lead / College Visit, multi-select → **Pin selected to Student Master / College Visits**. That stores entity pins in `employee_crm_pins` and merges them into employee **Student Master → All Students** / **College Visits** (via `/api/tasks/crm-pins`). **Project** tasks still use **`employee_task_pins_section_patch.sql`** + **Pin selected to dashboard** (Dashboard → My tasks). View opens the same Edit student / Edit college form as CRM; Activity opens separately.

**Project dashboard pins?** Re-run **`employee_task_pins_section_patch.sql`** after `tasks_linked_lead_access.sql` (adds `pin_section`, `can_pin_employee_task`, and **`upsert_my_task_pins` RPC**). My Tasks also has **`/api/tasks/pins`** as a service-role fallback.

My Tasks (employee) uses ownership tabs (**Assigned to me** / **Tasks I assigned**) plus type tabs (**Student Lead** / **College Visit** / **Project**) so columns match the link type. Phone / WhatsApp / email work on student-lead tasks; **View** opens the CRM edit form and **Activity** opens history separately.

### Student portal (same modules as employee)

Students use `/student/*` with the same attendance (GPS + work summary), permission, leave, policies, and profile flows as employees. Also requires:

- **`aj_academy_platform_expansion.sql`** — `profiles.course`, `assigned_mentor_id`, counselling
- **`counselling_sessions_patch.sql`** — My Counselling page + dashboard notifications
- **`employee_module_schema.sql`** — permission + leave tables (shared RLS via `employee_id = auth.uid()`)
- **`company_policies_schema.sql`** (+ optional category patch) — policy gate on student layout

Set `course` / `department` / `assigned_mentor_id` on the student’s `profiles` row for the dashboard course & batch card.

### Freelancer portal

Freelancers now use `/freelancer/*` routes for attendance (selfie check-in), **Assign Tasks**, **Reimbursement**, and **My Profile**.  
Task popups use `in_app_notifications` (fallback `/freelancer/my-tasks`).

### Mentor portal

Mentors use `/mentor/*` for attendance (selfie), **Assign Tasks**, counselling, **Reimbursement**, **My Profile**, and dashboard **student roster**.  
Requires `aj_academy_platform_expansion.sql`, `mentor_department_tasks.sql`.

### Reimbursement (admin + employee / mentor / freelancer)

Run **`finance_schema.sql`**, then **`reimbursement_schema_patch.sql`**, then **`portal_expense_claims_rls.sql`**.

- **Admin:** sidebar **Reimbursements** (`/admin/reimbursements`) — Overview, All Claims, Pending, Special Approvals, Reimbursed, Policy Settings, Reports.
- **Members:** sidebar **Reimbursement** — tabs: Overview, Submit Claim, My Claims, Import Bills, Policy & Limits (BB OS layout).

### Task completion files

Run **`task_completion_attachments.sql`** so students can upload files when marking tasks complete; assigners see them in task view + get `create_task_completed_notification`.

### Reminders & Calendar (additive)

Run **`aj_reminders_schema.sql`** after `schema.sql` / profiles helpers (`is_admin`). Creates **only** `aj_reminders*` tables + RLS — **does not alter** Student Master, College Visits, Tasks, Finance, Attendance, or `profiles` columns.

- Admin: `/admin/reminders` · Employee: `/employee/reminders`
- Dashboard widget: Today’s Reminders (read-only counts + quick snooze/complete)
- Alerts processor: `POST /api/reminders/cron/process-alerts` with `Authorization: Bearer $CRON_SECRET`
  - `vercel.json` schedules **once daily** (`0 4 * * *` UTC) so Hobby-plan deploys succeed (Hobby forbids denser cron).
  - For frequent processing on Hobby, point an external cron (e.g. every 1–5 min) at the same URL with the Bearer secret.
  - Pro plan can change the schedule to `*/5 * * * *` if desired.
- Optional Web Push: set `REMINDER_VAPID_PUBLIC_KEY`, `REMINDER_VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_REMINDER_VAPID_PUBLIC_KEY`, install `web-push` if sending pushes
- Rollback: **`aj_reminders_rollback.sql`** (drops only `aj_reminder*` objects)

**Env (new only):** `CRON_SECRET`, optional VAPID keys above.


### Student Master (admin)

Run **`student_lead_master_schema.sql`**, then **`student_lead_master_aux_schema.sql`** (follow-ups/activities), then **`student_master_columns_patch.sql`**, then **`student_lead_master_rls_fix.sql`**.  
Admin sidebar **Student Master** (`/admin/student-master`) — All Students table columns match Meta CRM Import (`AJ_Academy_Meta_Leads_CRM_Import_*.xlsx` sheet **CRM Import**): City, Current Profile, College/Company, Career Goal, Preferred Job Role, Target Salary, Current Skill Level, Main Career Problem, Full Payment or Instalment, Parent Approval Required, Decision Maker, Laptop Availability, Primary Objection, plus counselling/admission fields. CSV/XLSX import & export use the same headers; XLSX import prefers the **CRM Import** sheet. Header filters: program, source, stage, status, priority, counsellor, payment, admission.  
**Settings tab (admin):** editable CRM lists (sources, statuses, programs, follow-up types, priorities) persist to `system_settings` key `crm` via `/api/admin/settings` (same store as Admin → System Settings → CRM). Staff read lists via `/api/crm/lists` (so employees get the same dropdowns). Requires `system_settings_rls_fix.sql` (step 10e) so admins can save. Dropdowns, filters, and Pipeline columns reload from those lists.  
Legacy URL `/admin/client-lead-master` redirects to `/admin/student-master`. Table name remains `public.clients` (FKs from projects/finance). Requires `student_master_columns_patch.sql` for the extra counselling columns.

10f4) portal_expense_claims_rls.sql (reimbursement for employee / mentor / freelancer — after finance_schema.sql)

If a leftover **`BB-internal-OS`** folder remains, close Cursor and any `npm run dev`, then delete that folder in File Explorer (it is an old duplicate).
