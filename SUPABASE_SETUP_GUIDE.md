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
ZOHO_MAIL_FROM=support@ajacademy.co.in
ZOHO_SMTP_PASSWORD=your-zoho-app-password
ZOHO_CLIENT_ID=your-zoho-client-id
ZOHO_CLIENT_SECRET=your-zoho-client-secret
ZOHO_REFRESH_TOKEN=your-zoho-refresh-token
ZOHO_SMTP_HOST=smtp.zoho.in
ZOHO_SMTP_PORT=465

# Firebase Cloud Messaging (optional — web push; Messaging only, not Auth)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

FCM setup checklist: **`AJ_Academy_OS/docs/FCM_PUSH.md`**. SQL: **`AJ_Academy_SB/fcm_push_devices.sql`** (see `DATABASE_SETUP_ORDER.txt` step 5c10).

`RESEND_API_KEY` is optional, but required if you want counselling schedule emails to be sent to students.

`GMAIL_OUTREACH_APP_PASSWORD` is required for Student Master outreach emails (sent from `ajacademy.co.in@gmail.com`). Create an [App Password](https://myaccount.google.com/apppasswords) on that Google account (2-Step Verification must be on).

For College Visits Email compose (provider switch), Gmail and Zoho can both be configured. Zoho supports:
- Recommended: SMTP app password (`ZOHO_MAIL_FROM`, `ZOHO_SMTP_PASSWORD`)
- Alternative: SMTP OAuth2 (`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_MAIL_FROM`)
- Zoho sends use `ZOHO_MAIL_FROM` as the From address (must match the authenticated mailbox). Optional `ZOHO_MAIL_REPLY_TO`.
- Student Master and Task outreach email now support Zoho/Gmail provider selection with the same `/api/outreach/send-email` endpoint.
- Outreach API responses include `provider` + `from` metadata so Activity Timeline logs show the actual sender mailbox for admin/employee tracking.

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
7b. **`in_app_notifications_realtime.sql`** (recommended — Realtime INSERT for bell chime + taskbar badge when a task is assigned while the dashboard is open)
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

If **Follow-up** save fails with database permissions (common for Admin after only running employee RLS), run **`lead_followups_rls_fix.sql`** (restores admin + employee policies on `lead_followups` / `lead_activities`). Safe to re-run.

### Student Lead calling & follow-up workflow

Run **`lead_call_workflow_schema.sql`** after `employee_student_master_rls.sql` + `crm_owner_isolation.sql` (safe to re-run). Adds:

- Table **`lead_call_sessions`** (initiated → outcome_pending → completed / cancelled / stale) with partial unique index so only one active call per lead
- Summary columns on **`clients`**: `current_call_*`, `last_call_outcome`, `total_call_attempts`, `next_follow_up_at`, `next_follow_up_employee_id`
- Extra columns on **`lead_followups`** / **`lead_activities`** (assigned employee, parent follow-up, call_session_id links)
- RPC **`start_lead_call_session`** (assignment check, concurrent-call lock, admin override) and **`mark_stale_lead_call_sessions`** (30-minute stale unlock)

Then run **`lead_call_outcome_snapshot_patch.sql`** (safe to re-run) so each completed call stores a full form snapshot (`outcome_snapshot` JSON) for previous-call history in the outcome modal.

App APIs (staff session): `POST /api/leads/call/start`, `POST /api/leads/call/complete`, `GET /api/leads/call/pending`, `GET /api/leads/call/live`, `GET /api/leads/call/history?leadId=`. Student Master mobile cards show Call / WhatsApp / Follow-up as primary actions; after dialer return, employees must confirm call outcome (web apps cannot detect whether a normal phone call was answered). Calling again always opens a fresh outcome form and shows previous outcomes with date/time and saved fields.

### Reports & Analytics

Run **`analytics_reporting_schema.sql`** after attendance, tasks, CRM, and `lead_call_workflow_schema.sql` (safe to re-run). Adds EOD columns on `work_summaries`, query indexes, and optional `analytics_employee_day_rollups` RPC.

- Admin: sidebar **Reports & Analytics** → `/admin/reports` (`AnalyticsWorkbench`)
- Employee: **My Reports** → `/employee/reports` (own data only)
- APIs: `POST /api/analytics/query`, `POST|PATCH /api/analytics/eod`
- Call Activity includes sessions by all staff roles (`admin`, `super_admin`, `employee`, `mentor`, `freelancer`) unless Employee filter is applied.
- Call Activity also includes **College Visits dialer Phone Call** logs from `college_visit_activities` (not only Student Master `lead_call_sessions`). Report day bounds use Asia/Kolkata.
- Full module docs: `AJ_Academy_OS/docs/REPORTS_ANALYTICS.md`

Also run **`reports_analytics_schema.sql`** after `lead_call_workflow_schema.sql` (and ideally after `student_lead_master_aux_schema.sql` + `student_master_columns_patch.sql` for follow-ups / admissions). Safe to re-run. Adds:

- Indexes on attendance / tasks / clients for date and filter queries
- Views **`v_report_call_sessions`**, **`v_report_followups`**, **`v_report_lead_activities`**, **`v_report_admissions`** (each skipped with a NOTICE if base table/columns are missing)
- RPC **`reports_schema_status()`** (admin-only) — probes which report tables/columns/views exist
- API: `GET /api/reports/data` (admin session + service role) with SQL-side date / employee / department / lead-source / course filters. Call duration uses **`approximate_duration_seconds` only** (never invented). Organizational **branch** filter is unavailable (no branch column on profiles/clients).

**Attendance camera / location:** Employee layout shows a one-time popup asking for camera + location (saved in browser localStorage per user). `Permissions-Policy` must allow `camera=(self)` and `geolocation=(self)` (see `lib/security/headers.ts`). Restart the Next server after header changes.

### HR, Attendance & Payroll (module in progress — phased build)

A full audit precedes implementation: see **`PAYROLL_MODULE_AUDIT.md`** (repo root) for the feature inventory, database mapping, and phased plan. The module **reuses** existing `attendance_records`, `profiles` / `employee_details` / `employee_profile_details` (bank/PAN), `permission_requests`, `in_app_notifications` + FCM, and the private storage + signed-URL pattern. It does **not** create a second attendance system and does **not** modify the check-in/check-out flow.

**Phase 1 — Attendance integrity & review.** Run **`hr_payroll_01_attendance_integrity.sql`** after `schema.sql` + `attendance_module.sql` (safe to re-run):

- De-duplicates `attendance_records` and adds **UNIQUE(employee_id, attendance_date)** (re-points `work_summaries` to the surviving row before deleting duplicates).
- Creates **`attendance_corrections`** (review/correction queue) with RLS: employees read their own; admins manage all.
- **Activates `audit_logs`**: enables RLS with an admin-read policy and adds target/actor/module indexes. The app now writes real audit rows via `lib/hr/auditLog.ts` (service role); `logSecurityEvent` remains for console-level events.

App surface (Phase 1):

- Admin sidebar **HR, Attendance & Payroll → Attendance Review** (`/admin/hr-payroll/attendance-review`).
- API **`GET/POST/PATCH /api/hr/attendance/review`** (admin session + service role): list attendance issues (missing check-out, late, short hours) with a date/employee filter; raise a correction with a mandatory reason; approve (applies revised values + recomputes working minutes) or reject. Every action is audited (`attendance_correction_requested/approved/rejected`).
- Status derivation is pure and reusable: `lib/hr/attendanceStatus.ts` (`deriveAttendanceForDay`). Each day uses the **effective-dated** `attendance_policies` row for that date (Phase 2); falls back to a clearly-labelled built-in default if the migration is not applied yet.

**Phase 2 — Attendance policies (effective-dated).** Run **`hr_payroll_02_attendance_policies.sql`** after Phase 1 (safe to re-run):

- Table **`attendance_policies`**: office hours, grace minutes, full/half-day thresholds, max break, late/early/missing-checkout rules, weekly-off days, holiday/WFH/permission behaviour, overtime knobs, attendance rounding, salary-day method (`calendar_days` / `fixed_30` / `working_days` / `configured_days`).
- **Effective dating:** publishing a new version closes the previous open policy (`effective_to = day before`) so locked payroll can still resolve the historical policy by date. Only one open-ended (`effective_to is null`) policy is allowed.
- Seeds one active policy from existing `attendance_settings` and/or `system_settings.attendance` JSON when present.
- RPC **`resolve_attendance_policy(date)`** (SQL helper) + app resolver `lib/hr/attendancePolicy.ts`.

App surface (Phase 2):

- Admin sidebar **Attendance Policies** (`/admin/hr-payroll/attendance-policies`).
- API **`GET/POST/PATCH /api/hr/attendance/policies`** (admin session): list + resolve active policy; publish a new version (audited); update name/notes of an existing version.
- Attendance Review now loads the policy effective on each attendance date (not a hardcoded default).

**Phase 3 — Holiday calendar.** Run **`hr_payroll_03_holidays.sql`** (safe to re-run). Table **`holidays`** (date, name, public/company/optional, paid flag). Nothing is seeded — add holidays via **Admin → HR, Attendance & Payroll → Holiday Calendar** (`/admin/hr-payroll/holidays`). API `GET(staff)/POST/PATCH/DELETE(admin) /api/hr/holidays` — all writes audited. Holidays are excluded from chargeable leave days and feed attendance/payroll calculations.

**Phase 4 — Leave management (fresh module).** Run **`hr_payroll_04_leave_management.sql`** (safe to re-run; needs `btree_gist` extension, enabled by the script):

- **`leave_types`** — seeded with NAMES + paid/unpaid flags only (CL, SL, EL, PL, LWP, CO, WFH, ML, PTL, OTH). **Annual entitlements default to 0** and must be configured in the admin UI — no policy numbers are invented. WFH is `counts_as_presence` (attendance credit, no balance burn).
- **`leave_balances`** — per employee/type/year (opening + accrued + adjusted − used). Balance rows are created on first approval; until then the configured annual entitlement acts as the available grant.
- **`leave_applications`** — with a DB **exclusion constraint** preventing overlapping pending/approved requests per employee. Half-day supported (single date). Chargeable days **exclude weekly offs (per effective policy) and holidays**.
- Legacy `leave_requests` (attendance_module.sql) is **deprecated and untouched**.
- RLS: employees insert/read/cancel their own; admins manage everything.

App surface (Phase 4):

- Admin sidebar **Leave Management** (`/admin/hr-payroll/leave-management`) — Requests tab (approve/reject with remarks; approval burns balance, rejection doesn't) + Leave Types tab (configure entitlements/notice/flags).
- Employee sidebar **My Leave (HR)** (`/employee/hr-payroll/leave`) — balances, apply (validates type rules, notice period, document requirement, balance, overlap), history, cancel pending.
- APIs: `GET/POST/PATCH /api/hr/leave/applications` (staff session; employees see only their own), `GET/POST/PATCH /api/hr/leave/types` (read staff, write admin). All approve/reject/cancel/config actions are audited (`leave_applied/approved/rejected/cancelled`, `leave_type_updated`).
- Attendance Review now treats configured holidays as holiday context when deriving statuses.

**Phase 5 — Employee salary structures.** Run **`hr_payroll_05_salary_structures.sql`**. Table **`employee_salary_structures`** (effective-dated; one open row per employee). Adds **`uan_number` / `esi_number`** on `employee_profile_details` when that table exists. Admin UI: `/admin/hr-payroll/salary-structures`. API `GET/POST /api/hr/salary/structures` (employees can read own; admin writes). Change reason required; previous open version is closed on publish.

**Phase 6 — Payroll settings.** Run **`hr_payroll_06_payroll_settings.sql`**. Table **`payroll_settings`** (effective-dated). Seeds company name/address/logo/currency from `system_settings.company` when present (default brand **AJ Academy**). Statutory deductions **default OFF** and labelled `not_verified`. Admin UI: `/admin/hr-payroll/payroll-settings`. API `GET/POST /api/hr/payroll/settings`.

**Phase 7 — Payroll calculation engine.** Run **`hr_payroll_07_payroll_engine.sql`**. Tables **`payroll_periods`** + **`payroll_items`** store reproducible results (policy/settings/structure snapshots, attendance totals, component breakdown). Server engine: `lib/hr/payrollEngine.ts` + `POST /api/hr/payroll/calculate`. Uses real attendance, approved leave, holidays, salary structures, and payroll settings. Missing salary structure → error (not zero salary). Unresolved missing check-outs block when clearance is required. Locked/approved periods cannot be recalculated (approve/lock UI arrives in Phase 8). Admin UI: `/admin/hr-payroll/monthly-payroll`.

**Phases 8–10 — Workflow, adjustments, approve/lock/reopen.** Run **`hr_payroll_08_10_workflow_adjustments.sql`** after Phase 7:

- Adds workflow columns on `payroll_periods` (`approved_by/at`, `locked_by/at`, `reopened_by/at`, `reopen_reason`, `paid_by/at`, `payment_reference`).
- Table **`salary_adjustments`**: pending → approved/rejected/cancelled. **Only approved** adjustments are applied on recalculation. Types cover incentives, bonus, reimbursements, advance/loan recovery, penalties, etc.
- API `POST /api/hr/payroll/workflow` — status transitions with audit. **Reopen requires Super Admin + reason** and returns the period to `draft`. Approve/lock blocked when employee calculation errors remain. Lock freezes item statuses.
- API `GET/POST/PATCH /api/hr/payroll/adjustments` — create pending, approve/reject/cancel (audited). Blocked against approved/locked/paid periods.
- Engine includes approved adjustments in gross/deductions/net and snapshots them in `input_snapshot`.
- Admin UI: **Monthly Payroll** workflow buttons; **Salary Adjustments** (`/admin/hr-payroll/salary-adjustments`).

**Phases 11–13 — Payslips, employee portal, reports & salary queries.** Run **`hr_payroll_11_13_payslips_queries.sql`** after Phases 8–10:

- Tables **`payslips`** (PDF metadata + snapshot) and **`salary_queries`**. Private Storage bucket **`payslips`** (not public; no authenticated storage policies — uploads/downloads via service-role signed URLs, ~120s).
- Generate only after payroll is **approved / locked / paid**. Release makes slips visible to the employee. Regenerated slips stay employee-visible only when previously released (`released_at` set).
- APIs: `GET/POST /api/hr/payslips` (list, signed download, generate, release); `GET/POST/PATCH /api/hr/salary/queries`; `GET /api/hr/payroll/reports` (register, bank transfer with optional mask, attendance, LOP, department, audit, etc.; CSV/Excel/PDF from UI).
- Admin UI: **Payslips**, **Salary Queries**, **Payroll Reports**. Employee sidebar group **My HR & Payroll**: Leave, Payslips, Salary Structure, Salary Queries.

**Phase 14 — Notifications & idempotent automation.** Run **`hr_payroll_14_automation.sql`**:

- Table **`payroll_automation_jobs`** with unique `idempotency_key` (safe daily re-runs).
- In-app + FCM via `sendPushNotification` (generic copy — no salary amounts): leave submit/approve/reject, payslip release, salary query updates, cutoff reminders.
- On **lock**, if Payroll Settings → **Auto-generate & release payslips on lock**, enqueues one generate job per period and processes it.
- Cron: `GET/POST /api/hr/payroll/cron/process` with `Authorization: Bearer $CRON_SECRET` (also `x-cron-secret`). Scheduled in `vercel.json` at `15 4 * * *`. Admin can run/list via `GET/POST /api/hr/payroll/automation`.

**Phase 15 — Security review & test matrix.** See repo root **`PAYROLL_SECURITY_AND_TEST_MATRIX.md`** (RLS/storage review, authz matrix, full A–J test cases, sign-off checklist).

### College Visits

Run **`college_visits_schema.sql`** after `schema.sql` (requires `is_admin()` / profiles), then **`college_visits_visited_by_patch.sql`** (adds `visited_by` / `visited_by_name` for who visited), then **`college_visits_proposal_patch.sql`** (Proposal Tracker: link + PDF columns and `college-visit-proposals` storage bucket), then **`college_visits_contacts_patch.sql`** (multiple contacts: name / role / alternate phones / email JSON + primary sync), then **`proposals_file_upload_patch.sql`** (unified private `proposals` bucket + file columns on `clients` and `college_visits` for PDF/DOC/DOCX upload on Add/Edit), then **`proposals_multi_file_patch.sql`** (multi-file attachments table for Student/College proposals), then **`crm_owner_isolation.sql`**, then **`crm_delete_fix.sql`**. Adds:

- `/admin/college-visits` and `/employee/college-visits` — **same subsection tabs as Student Master**: Overview, All Colleges, Follow-ups, Pipeline, Converted Colleges, MOU Tracker, **Proposal Tracker**, Activity Timeline (+ Reports / Settings for admin). **Admin sees all employees’ colleges**; **employees see only their own**. Share via College Visit tasks without opening another employee’s full CRM.
- **Settings tab (admin):** editable visit / MOU / proposal / final status lists persist to `system_settings` key `college_visits` via `/api/admin/settings`. Staff read via `/api/college-visits/lists` (same store as Admin → System Settings → College Visits). Dropdowns, filters, and Pipeline columns use those lists.
- Add/Edit includes **Whom visited to the college** (`visited_by`) and auto-calculates **Lead Score** from visit/MOU/follow-up/proposal/final-status signals.
- **Last outcome / remarks is append-only** on edit: PATCH merges the new note into the existing `last_outcome_remarks` log *before* writing (empty / identical payload keeps the prior log). Each save adds a new IST date-time entry; history renders as separate boxes in Edit/View. No additional SQL required.
- **Import / Export CSV** includes primary contact plus **Contact 2 / Contact 3** (name, role, phone, alternate phone, email) and **Alternate Phone 2 / 3** on the primary — same multi-contact model as Add/Edit. Older single-contact CSVs still import.
- Proposal Tracker / Add·Edit forms upload **PDF, DOC, or DOCX** (max 10 MB) into the private `proposals` bucket; legacy URL/PDF fields remain readable. College Visit proposal upload now supports **multiple files**.
- College Visits Email action opens provider options (**Zoho Mail** / **Gmail**) with full compose fields (To, CC, Subject, Body, Attachments) and logs sent emails in activity.
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

**Task assigned — no chime / no taskbar badge (1, 2, 3)?** Install AJ OS as a PWA (Chrome → Install app) so Windows shows the numbered badge on the taskbar icon. Run **`in_app_notifications_realtime.sql`** so the bell chime fires while the dashboard is open. When the app is minimized, FCM + the service worker show a Windows toast (OS sound); custom chime plays when the app is in the foreground after the employee has clicked once on the dashboard.

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

Mentors use `/mentor/*` for attendance (selfie), **Assign Tasks**, **My Tasks**, counselling, **Reimbursement**, **My Profile**, and dashboard **student roster**.  
Requires `aj_academy_platform_expansion.sql`, `mentor_department_tasks.sql` (then `freelancer_department_tasks.sql` if freelancers also assign).

**Department scoping:** Roster and Assign Tasks both use `get_department_task_assignees()` — only **active students** whose `profiles.department` matches the mentor/freelancer department (case/whitespace-insensitive). Mentors assign simple department tasks (no CRM lead/college/project link required).

### LMS Academic Management (Phase 1)

Audit first: **`LMS_MODULE_AUDIT.md`** (repo root).

Run in Supabase SQL Editor (after platform expansion + system settings):

1. **`lms_01_academic_foundation.sql`** — `academic_departments`, `academic_courses`, `academic_batches`, `academic_modules`, `student_enrolments`, seed/backfill RPCs  
2. **`lms_02_mentor_allocations.sql`** — effective-dated `mentor_allocations` + mentor scope helpers + RLS  
3. **`lms_03_assignments.sql`** — `lms_assignments`, recipients, submissions, evaluations, `lms_publish_assignment` RPC  
4. **`lms_04_projects.sql`** — academic projects, milestones, recipients  
5. **`lms_05_study_materials.sql`** — materials, recipients, activity, private `study-materials` bucket  
6. **`lms_06_tickets.sql`** — queries & complaints (sensitive → admin only), `query-attachments` bucket  
7. **`lms_07_tests_core.sql`** — tests, MCQ questions, recipients, server-side attempts/timer, autosave, objective grading  
8. **`lms_08_submissions_proctoring.sql`** — assignment submit/evaluate RPCs, private buckets (`assignment-submissions`, `test-proctoring`, …), proctoring policy/consent/events  
9. **`lms_09_project_milestones.sql`** — project milestone submit + mentor evaluate RPCs  
10. **`lms_10_calendar_reports.sql`** — `lms_academic_events` + `lms_report_summary()`  

Then in the app:

- **Admin → Academic Management** — Overview, Mentor Allocation, Calendar & Reports, Student Query Monitoring  
- **Mentor → Learning Management** — Overview, Assignments, Submissions & Evaluation (assignments + projects), Projects, Tests, Study Materials, Student Queries  
- **Student → Learning & Assessments** — Overview, Assignments (submit), Projects (milestones), Tests (consent + timer), Materials, Queries & Complaints  

Signed downloads for private LMS files: `POST /api/lms/storage/signed-url` (authz-checked).

Do **not** confuse CRM `clients` (Student Master leads) with portal student enrolments. Ops `tasks` / `projects` remain separate from LMS coursework.

### Student My Tasks

Students see `/student/my-tasks` and dashboard task preview **without** employee CRM columns (Linked To, Lead Contact, lead/college/project tabs). Columns focus on title, assigner, priority, status, dates, and progress.

**Delete selected permission denied?** Run **`tasks_student_delete_own.sql`** so students can delete tasks assigned to them.

### Reimbursement (admin + employee / mentor / freelancer)

Run **`finance_schema.sql`**, then **`reimbursement_schema_patch.sql`**, then **`portal_expense_claims_rls.sql`**.

- **Admin:** sidebar **Reimbursements** (`/admin/reimbursements`) — Overview, All Claims, Pending, Special Approvals, Reimbursed, Policy Settings, Reports.
- **Members:** sidebar **Reimbursement** — tabs: Overview, Submit Claim, My Claims, Import Bills, Policy & Limits (BB OS layout).
- **Finance → Settings:** editable income categories, expense categories, and payment methods persist to `system_settings` key `finance` via `/api/admin/settings`. Staff read via `/api/finance/lists` (same store as Admin → System Settings → Finance). Form dropdowns use those lists. Only admins can save. Requires `system_settings_rls_fix.sql` (step 10e).

### Task completion files

Run **`task_completion_attachments.sql`** so students can upload files when marking tasks complete; assigners see them in task view + get `create_task_completed_notification`.

### Reminders & Calendar (additive)

Run **`aj_reminders_schema.sql`** after `schema.sql` / profiles helpers (`is_admin`). Creates **only** `aj_reminders*` tables + RLS — **does not alter** Student Master, College Visits, Tasks, Finance, Attendance, or `profiles` columns. If reminder save fails with `infinite recursion detected in policy for relation "aj_reminders"`, run **`aj_reminders_rls_recursion_fix.sql`** (safe to re-run; does not touch CRM).

- Admin: `/admin/reminders` · Employee: `/employee/reminders`
- Dashboard widget: Today’s Reminders (read-only counts + quick snooze/complete)
- While any admin/employee page is open, due alerts are processed on poll (~20s) so sound/popup do not wait for the daily Hobby cron
- In-app popup + Web Audio chime + optional browser notifications (enable in Reminders → Settings)
- Alerts processor: `POST /api/reminders/cron/process-alerts` with `Authorization: Bearer $CRON_SECRET`
  - `vercel.json` schedules **once daily** (`0 4 * * *` UTC) so Hobby-plan deploys succeed (Hobby forbids denser cron).
  - For frequent processing when no one is logged in, point an external cron (e.g. every 1–5 min) at the same URL with the Bearer secret.
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
