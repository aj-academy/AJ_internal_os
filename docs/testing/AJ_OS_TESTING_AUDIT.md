# AJ OS — Phase 1 Testing Audit (Read-Only)

**Date:** 10 August 2026  
**Mode:** SAFE TESTING MODE — read-only inspection only  
**Scope:** Repository inspection. No installs, no database changes, no load tests, no user creation, no emails/notifications sent.  
**Environment assumption:** Treat connected Supabase / Vercel as **PRODUCTION / UNKNOWN** until a separate staging project is confirmed.

---

## How to read this document

Findings are tagged:

| Tag | Meaning |
|-----|---------|
| **SAFE** | Low risk to inspect or run later with approval (build/lint/read-only docs). |
| **CAUTION** | Needs care; can touch real data or real users if misused. |
| **HIGH RISK** | Can damage data, flood users, or stress production. Do not run without explicit approval and staging. |

---

## 1. Current application architecture

### What AJ OS is

AJ OS is a multi-role internal platform for AJ Academy:

- **Frontend / API:** Next.js App Router app in `AJ_Academy_OS/`
- **Database / Auth / Storage:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **SQL scripts:** `AJ_Academy_SB/` (manual SQL Editor order in `DATABASE_SETUP_ORDER.txt`)
- **Hosting:** Vercel (PWA install UI references `aj-academy.vercel.app`)

### Stack versions (from `AJ_Academy_OS/package.json`)

| Piece | Version / note |
|-------|----------------|
| Next.js | **16.2.4** (App Router — `app/` directory) |
| React | **19.2.4** |
| TypeScript | **^5** (`strict: true`) |
| Supabase JS | `@supabase/supabase-js` ^2.104, `@supabase/ssr` ^0.10 |
| Firebase | `firebase` + `firebase-admin` (FCM / PWA push) |
| Email | `nodemailer` (Zoho/Gmail SMTP) + `resend` |
| Spreadsheets | `xlsx` (imports/templates) |
| UI | Tailwind 4, lucide-react, shadcn-related packages |

### Router model

- **App Router only** (100+ `page.tsx` routes under `app/`).
- Role area prefixes: `/admin`, `/mentor`, `/student`, `/employee`, `/freelancer`.
- Auth pages: `/login`, `/forgot-password`, `/reset-password`, `/auth/reset-password`.

### Middleware

File: `AJ_Academy_OS/middleware.ts`

- **Passthrough only** (sets `x-ajos-pathname`).
- Session refresh in middleware is **intentionally disabled** (comment: avoid production `MIDDLEWARE_INVOCATION_FAILED`).
- Route protection relies on **Server Components** via `requireRole()` in role layouts.

**CAUTION:** Edge middleware does not block unauthorized URL access by itself; protection depends on layouts/API checks. That is fine if consistently applied, but API routes must each enforce auth.

### Authentication implementation

| Layer | Location | Behaviour |
|-------|----------|-----------|
| Browser client | `lib/supabase/client.ts` | Anon key + cookies |
| Server client | `lib/supabase/server.ts` (+ related helpers) | Cookie session |
| Service role | `lib/supabase/admin.ts` | **Server-only**; creates/updates Auth users |
| Role gate | `lib/auth/requireRole.ts` | Loads profile; redirects if wrong/inactive role |
| API gates | `lib/security/auth/*` | `requireAdminApi`, `requireStaffApi`, etc. |
| Sign-in / forgot password | `app/api/auth/*` | Server routes |

Roles observed in layouts / SQL: `super_admin`, `admin`, `mentor`, `student`, `employee`, `freelancer` (plus historical/manager/accounts patterns in older RLS scripts).

### Role routing

Layouts call `requireRole([...])`:

- Admin: `super_admin`, `admin`
- Mentor: `mentor`
- Student: `student`
- Employee: `employee`
- Freelancer: `freelancer`

Wrong role → redirect to that role’s home path (`getRoleRedirectPath`).

---

## 2. Existing testing tools

Inspected `AJ_Academy_OS/package.json` scripts and dependencies.

| Tool | Present? | Evidence |
|------|----------|----------|
| Vitest | **No** | Not in dependencies / no config |
| Jest | **No** | Not found |
| Playwright | **No** | Not found |
| Cypress | **No** | Not found |
| React Testing Library | **No** | Not found |
| k6 scripts | **No** | No `tests/load` / k6 folder |
| axe / Lighthouse CI | **No** | Not found |
| Supabase automated tests | **No** | SQL is manual; no pgTAP / CI DB tests found |
| `*.test.ts` / `*.spec.ts` | **None found** | Repo search empty |

### npm scripts that exist today

```text
dev                 → next dev
build               → next build
start               → next start
lint                → eslint
generate-pwa-icons  → node scripts/generate-pwa-icons.mjs
```

**Missing scripts:** `test`, `typecheck`, `e2e`, `load`.

### Related (not automated test suites)

- Manual audit markdown at repo root (`LMS_MODULE_AUDIT.md`, `FORGOT_PASSWORD_AUDIT.md`, `STUDENT_IMPORT_AND_MENTOR_ALLOCATION_AUDIT.md`, `PAYROLL_SECURITY_AND_TEST_MATRIX.md`, etc.).
- `security/harness/SECURITY_HARNESS_LOG.txt` (log artifact; not a full CI suite).
- App security helpers under `AJ_Academy_OS/lib/security/` (runtime code, not tests).

**SAFE:** Documenting gaps.  
**HIGH RISK:** Assuming production is “tested” because pages load — there is no automated regression suite yet.

---

## 3. Missing testing tools (recommended later — not installed)

Do **not** install until you approve Phase 4+.

| Need | Typical tool | Why |
|------|--------------|-----|
| Unit / component | Vitest + RTL | Fast logic tests without browsers |
| Browser E2E | Playwright | Login, role URLs, smoke flows |
| Load / concurrency | k6 (against **staging only**) | 5→200 user ramp |
| A11y spot-checks | axe (via Playwright) | Accessibility regressions |
| Type gate in CI | `tsc --noEmit` script | Catch TS errors without full build |

---

## 4. Modules found

Mapped from `app/` routes and `app/api/` (+ LMS SQL).

### Admin

- Dashboard / settings / reports / finance / portfolio  
- Academic: overview, catalog, departments-courses, tests, queries, mentor-allocation, reports  
- Student Management: directory, bulk-import, mentor-allocation, mentor-capacity, reports  
- Student Master (CRM leads), Client Lead Master, College Visits  
- Employee Master, Freelancers, Task Assignment, Reminders  
- HR & Payroll (attendance, leave, salary, payslips, adjustments, etc.)  
- Reimbursements, Counselling, Notification diagnostics  

### Mentor

- Dashboard, students, attendance, profile, my-tasks, assign-tasks  
- Learning: assignments, projects, tests, materials, queries, submissions  
- Counselling, reimbursement  

### Student

- Dashboard, profile, attendance, leave, permission, policies, portfolio, my-tasks, counselling  
- Learning: assignments, projects, **tests**, materials, queries  

### Employee / Freelancer (operations)

- CRM Student Master, lead management, college visits, attendance, HR, tasks, reminders, notifications  

### Cross-cutting

- Authentication / forgot & reset password  
- In-app notifications + FCM push (`fcm_push_devices`, `app/api/push/*`)  
- PWA (`manifest`, `sw.js`, install page)  
- Bulk student import APIs under `app/api/admin/students/import/*`  
- LMS uploads (assignment/project/proctoring)  

---

## 5. Database structure relevant to testing

SQL lives in **`AJ_Academy_SB/`** (~100 scripts). Not a single Prisma schema — apply order documented in `DATABASE_SETUP_ORDER.txt`.

### Core identity

- `profiles` (+ role/status)  
- `employee_details`, employee self-service / documents  

### Academic / LMS (high priority for concurrency testing later)

| Area | Example tables |
|------|----------------|
| Foundation | `academic_departments`, `academic_courses`, `academic_batches`, `academic_modules`, `student_enrolments` |
| Mentors | `mentor_allocations`, `student_mentor_assignments`, `mentor_capacity` |
| Assignments | LMS assignment tables (`lms_assignments.sql`) |
| Projects | `lms_projects` + milestones |
| Materials | `lms_study_materials` |
| Tickets/queries | `lms_tickets` |
| **Tests** | `lms_tests`, `lms_test_questions`, `lms_test_recipients`, `lms_test_attempts`, `lms_test_attempt_questions`, `lms_test_answers` |
| Proctoring | `lms_test_proctoring_*`, media policies |

### Important test RPCs (security definer)

From `lms_tests_core.sql` (read-only review):

- `lms_start_test_attempt`  
- `lms_save_test_answer`  
- `lms_submit_test_attempt` — uses `FOR UPDATE`, returns **idempotent** if attempt already `locked`  
- Unique constraints on attempt number, answers per question, recipients per student  

**SAFE note for later testing:** Submit path was designed with locking/idempotency — still must be validated under concurrency on **staging**, never guessed from SQL alone.

### CRM / ops

- `clients` (Student Master / leads), college visits, tasks, reminders, attendance, finance, payroll, etc.

### Import

- `student_import_batches`, `student_import_rows`

### Clients used by the app

- Browser anon client  
- Server user client  
- **Service role admin client** for privileged Auth/ops  

**CAUTION:** Any automated test that uses service role can bypass RLS. Never point load scripts at production service role.

---

## 6. Authentication structure

1. User signs in (Supabase Auth).  
2. Profile row supplies `role` + `status`.  
3. Layouts call `requireRole`.  
4. APIs should verify session + role (helpers exist under `lib/security/auth`).  
5. Password recovery: `/forgot-password` + API + docs in `AJ_Academy_OS/docs/FORGOT_PASSWORD_SETUP.md`.  
6. First-login flows: `app/api/auth/first-login`, `needs-first-login`.

**CAUTION:** Forgot-password and counselling/attendance notification routes can send **real emails** if SMTP/Resend env is configured. Do not exercise those against real addresses in Phase 1–5 without test inboxes.

**HIGH RISK:** Creating hundreds of Auth users or bulk password resets on the live Supabase project.

---

## 7. RLS structure

RLS is applied via many SQL files, including:

- `rls-policies.sql`, `profiles_rls_fix.sql`, `profiles_rls_tighten.sql`  
- `security_rls_access_fix.sql`, `storage_rls_tighten.sql`  
- LMS: `lms_tests_rls_fix.sql`, mentor recursion fixes  
- CRM: `employee_student_master_rls.sql`, `crm_owner_isolation.sql`, delete RPCs  
- HR / tickets / reminders / etc.

Pattern:

- `ENABLE ROW LEVEL SECURITY`  
- Policies using helpers like `get_user_role()`, `is_admin()`, mentor/student helpers  
- Some **security definer** RPCs deliberately set `row_security = off` after internal auth checks (tests, deletes)

**CAUTION:** Policy history is patch-based (drop/create). Live DB may differ slightly from repo if not all scripts were applied in order.

**HIGH RISK:** Auto-changing RLS or disabling RLS. Phase 6 must **read and report only** until you approve SQL.

---

## 8. Potential security risks

| ID | Risk | Severity tag | Notes |
|----|------|--------------|-------|
| S1 | Middleware does not enforce auth | **CAUTION** | Relies on layouts/APIs; missing API check = IDOR risk |
| S2 | Service role key on server | **CAUTION** | Correct if never exposed to client; misuse in scripts is dangerous |
| S3 | Security-definer LMS RPCs | **CAUTION** | Powerful; must keep auth checks correct under load |
| S4 | Email/push routes | **HIGH RISK** if tested carelessly | Can notify real users |
| S5 | Storage uploads (proposals, submissions, proctoring, selfies) | **CAUTION** | Need bucket policy + file-type validation review |
| S6 | Role escalation / wrong-role URL | **CAUTION** | Needs Playwright matrix later |
| S7 | CRM admin delete / ownership RPCs | **HIGH RISK** on prod data | Already used for lead cleanup; never in automated tests on prod |

Existing mitigations observed (code): security headers, safe redirect helper, rate-limit helper, admin API guards, submit idempotency for locked attempts.

---

## 9. Potential performance risks

| ID | Risk | Tag | Why it matters for “200 students” |
|----|------|-----|-----------------------------------|
| P1 | Concurrent `lms_save_test_answer` / submit | **HIGH RISK** (load) | Hot path under exam conditions |
| P2 | Unbounded or high `.limit()` client queries | **CAUTION** | e.g. large CRM / portfolio selects |
| P3 | Dashboard aggregations / reports | **CAUTION** | Admin reporting under load |
| P4 | Proctoring snapshot uploads | **CAUTION** | Bandwidth + storage + CORS |
| P5 | Realtime notification fan-out | **CAUTION** | Many concurrent connections |
| P6 | Bulk student import | **CAUTION** | Auth user creation + row inserts |
| P7 | No automated perf baseline | **CAUTION** | Cannot prove readiness yet |

**Do not run k6 / 200-user tests against production.**

---

## 10. Potential data consistency risks

| ID | Risk | Tag | Notes |
|----|------|-----|-------|
| D1 | Duplicate final test submissions | **HIGH RISK** if broken | SQL has lock + idempotent return — must verify under concurrent submit |
| D2 | Lost autosave answers | **HIGH RISK** | Network retries / double-save |
| D3 | Mentor allocation capacity drift | **CAUTION** | Capacity tables + overrides |
| D4 | Bulk import duplicates (email/reg) | **CAUTION** | Import dry-run APIs exist — use them |
| D5 | CRM lead re-import duplicates | **CAUTION** | Client-side conflict matching (recent product work) |
| D6 | Auth user vs `profiles` drift | **CAUTION** | Scripts mention role sync |

---

## 11. What can be safely tested **now** (with your approval for Phase 2)

Treat environment as production until proven otherwise.

| Action | Tag | Touches DB? | Touches users? |
|--------|-----|-------------|----------------|
| Read more code / SQL | **SAFE** | No | No |
| `npm run lint` in `AJ_Academy_OS` | **SAFE** | No | No |
| `npx tsc --noEmit` (no script yet; local check) | **SAFE** | No | No |
| `npm run build` | **SAFE** | No write to Supabase | No |
| Expand documentation / test plans | **SAFE** | No | No |
| Prepare Playwright/k6 files **without executing** | **SAFE** | No | No |

---

## 12. What requires **staging**

| Activity | Why staging |
|----------|-------------|
| Create test Auth users | Avoid polluting real Auth |
| Insert/edit/delete students, assignments, tests | Avoid real academic data |
| Bulk import (even small) | Creates users/rows |
| Mentor allocation writes | Changes relationships |
| Test attempt start/save/submit | Writes LMS tables |
| Email / FCM | Must use test inboxes / disabled push |
| Any load test (5–200) | Protects production DB and Auth quotas |
| Destructive RLS experiments | Could lock out users |

**Staging must mean:** separate Supabase project (or clearly isolated DB), test-only users/courses/batches, notifications disabled or sandboxed.  
**Not found in repo:** a dedicated staging env config or second project URL. Production-like URL appears in install UI (`aj-academy.vercel.app`).

---

## 13. What requires **your explicit approval**

Before any of these, the agent must stop and ask:

1. Installing Playwright / Vitest / k6 / browsers  
2. Creating Auth or profile users  
3. Running tests that **write** to Supabase  
4. Sending email or push  
5. Changing RLS, Auth settings, env vars, Vercel config  
6. Any SQL migration / index creation  
7. Load tests at any concurrency level  
8. Pointing automation at a URL claimed as “staging” (you must confirm)  
9. Fixing CRITICAL/HIGH defects that change auth/RLS/architecture  

---

## 14. Recommended next action

**Recommended:** Approve **Phase 2 — Basic code health** only.

That means (after you say yes):

1. Inspect `package.json` again (already done).  
2. Run only existing safe commands: `npm run lint`, and likely `npm run build`.  
3. Optionally run TypeScript check via `npx tsc --noEmit` (no new install if TypeScript already present).  
4. Report results; **do not auto-fix** architecture issues without asking.

Then, if Phase 2 is clean enough, create **Phase 3** functional test plan docs (still no execution of destructive scenarios).

---

## Environment classification (Phase 1)

| Signal | Observation |
|--------|-------------|
| Separate staging Supabase documented? | **Not found** |
| `.env` files in repo? | **Not committed** (good) |
| Known production-ish host | `aj-academy.vercel.app` referenced in app |
| Current Cursor workspace env | **UNKNOWN → treat as PRODUCTION** |

---

## Summary scorecard

| Area | Status |
|------|--------|
| App architecture | Modern Next.js 16 App Router + Supabase multi-role OS |
| Automated tests | **Essentially none** |
| Lint/build scripts | Present (`lint`, `build`) |
| LMS concurrency design (SQL) | Thoughtful locks/idempotency — **unproven under load** |
| Staging | **Not confirmed** |
| Ready for 200-user test? | **No** — blocked until staging + gradual levels pass |

---

## Phase 1 complete — STOP

No tools were installed.  
No database was modified.  
No users were created.  
No emails/notifications were sent.  
No load tests were run.  
No application source code was changed for features (only this audit document was added).

**Awaiting your decision to continue to Phase 2 or stop.**
