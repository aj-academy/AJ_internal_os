# AJ OS — Phase 6 Authorization & RLS Report (SAFE MODE)

**Date:** 11 August 2026  
**Environment:** `http://localhost:3000` only  
**Accounts:** existing QA Admin / Mentor / Student only (`.env.e2e`)  
**Mode:** SAFE MODE — read-only probes; **no** application, database, Supabase, RLS, middleware, user, or role changes  
**Fixes applied:** **none** (security findings reported only)  
**Command:** `npx playwright test e2e/auth.setup.ts e2e/phase6 --retries=0`  
**Artifacts:** `AJ_Academy_OS/test-results/phase6-findings.json`, `phase6-run.txt`  

Harness note: one earlier attempt hit Chromium page crashes / cookie-token parse issues; **harness-only** navigation/token parsing was hardened, then Phase 6 was re-run once. This report reflects the **final** run.

---

## Executive summary

| Result | Count |
|--------|------:|
| **Pass** | 17 |
| **Fail** | 1 |
| **Blocked** | 1 |
| **Skipped (Playwright)** | 1 |
| **Confirmed security defects** | **1 (CRITICAL)** |
| **Harness failures (final run)** | 0 |
| **Environment / rate-limit failures** | 0 |

**Playwright:** 21 passed · 1 failed · 1 skipped · ~1.2 min · exit 1  

Portal UI/API role gates largely held. **Direct Supabase RLS `SELECT` on `public.profiles` allowed a student to read another student profile** — this is a confirmed authorization defect. No automatic fix was applied.

---

## Auth stack inspected (read-only)

| Layer | Finding |
|-------|---------|
| **Middleware** | `AJ_Academy_OS/middleware.ts` is a **passthrough** (pathname header only). UI auth is **not** Edge-enforced. |
| **UI gates** | `requireRole` in `app/admin|mentor|student/layout.tsx` — wrong role redirects to that role’s home. |
| **API gates** | `verifySessionRole` / `requireAdminApiSession`; LMS lists filter by `auth.uid()` for students. |
| **RLS (SQL)** | Profiles: `profiles_rls_fix.sql` (broad read) vs `profiles_rls_tighten.sql` (scoped). LMS policies in `lms_*.sql`. |
| **Storage** | LMS buckets private; downloads via `POST /api/lms/storage/signed-url` with app-layer ownership checks. `storage_rls_tighten.sql` does **not** cover LMS buckets. |
| **Super admin** | `assertSuperAdminActor` only on employee create/update writes — write probe **skipped** in SAFE MODE. |

---

## Results matrix

### Student

| ID | Layer | Check | Status |
|----|-------|-------|--------|
| STU-UI-PROFILE | UI | Own `/student/profile` | **Pass** |
| STU-UI-CROSS-PORTAL | UI | Cannot stay on `/admin` or `/mentor` dashboards | **Pass** |
| STU-API-ADMIN-MENTOR-DENY | API | Directory / my-students → 403 | **Pass** |
| STU-API-OWN-LMS-SCOPE | API | LMS lists load; tickets self-only (assign=0, test=2, mat=0) | **Pass** |
| STU-RLS-RECIPIENTS | RLS | Recipient tables only self (`leak=0`) | **Pass** |
| STU-RLS-PROFILE | RLS | Other student profile denied | **Fail (CRITICAL)** |
| STU-RLS-OWN-ROWS | RLS | Submissions / grades / tickets only self | **Pass** (0 rows present) |
| STU-STORAGE-FOREIGN | Storage | Foreign signed-url probe → 404 | **Pass** |

### Mentor

| ID | Layer | Check | Status |
|----|-------|-------|--------|
| MEN-UI-ADMIN-DENY | UI | Cannot open `/admin/dashboard` | **Pass** |
| MEN-UI-STUDENTS | UI | `/mentor/students` opens | **Pass** |
| MEN-API-ADMIN-DENY | API | Admin directory → 403 | **Pass** |
| MEN-RLS-ASSIGNED-STUDENTS | RLS | `student_mentor_assignments` only own mentor (21 rows) | **Pass** |
| MEN-RLS-UNRELATED-STUDENT | RLS | Out-of-scope student denied | **Blocked** |
| MEN-SENSITIVE-TICKETS | RLS/API | No sensitive tickets visible | **Pass** (0 tickets total) |
| MEN-API-LMS-LISTS | API | LMS lists 200 | **Pass** |

### Admin

| ID | Layer | Check | Status |
|----|-------|-------|--------|
| ADM-UI-MODULES | UI | Dashboard / academic / directory | **Pass** |
| ADM-UI-SETTINGS | UI | `/admin/settings` | **Pass** |
| ADM-API-DIRECTORY | API | Students directory 200 (~21) | **Pass** |
| ADM-SUPERADMIN-GATE | API/RLS | QA role=`admin` (not super_admin); write elevate **Skipped** | **Pass** |
| ADM-API-LMS | API | Assignments + tickets 200 | **Pass** |

---

## Confirmed security defect (do not fix yet)

### 1. Student can SELECT another student’s profile via RLS

| Field | Detail |
|-------|--------|
| **Severity** | **CRITICAL** |
| **Role** | Student |
| **Route / table / bucket** | Supabase PostgREST `public.profiles` (RLS SELECT) |
| **Expected access** | Own profile only (plus assigned mentor per tighten policies) — **0 rows** for another student `id` |
| **Actual access** | `own=1@200; other=1@200` — other student profile row returned |
| **Evidence** | Finding `STU-RLS-PROFILE` in `test-results/phase6-findings.json`; Playwright test failed on expect |
| **Likely cause** | Live DB still using broad policy (`profiles_authenticated_read` / `using (true)`) **or** tighten policies not applied / overridden. Repo intends scoped policies in `AJ_Academy_SB/profiles_rls_tighten.sql`. |
| **Proposed fix** | **Do not apply now.** In a controlled change window: confirm live policies in Supabase; apply/verify `profiles_rls_tighten.sql`; re-test student `SELECT` on another `profiles.id`. |

---

## Blocked / QA data needed

### Mentor out-of-scope student (MEN-RLS-UNRELATED-STUDENT)

All 21 catalog students appear assigned to the QA mentor and/or share department scope under `profiles_mentor_students_select` (assigned **or same department**).

**Provide one of:**
1. `E2E_UNRELATED_STUDENT_ID` — a student **not** assigned to QA mentor and **not** in mentor’s department, **or**
2. Create (manually, outside this SAFE run) a student in another department with no mentee link to QA mentor.

### Stronger positive deny proofs (optional)

| Need | Why |
|------|-----|
| Sensitive ticket (`is_sensitive=true`) owned by a student | Prove mentor cannot read it (currently 0 tickets) |
| Assignment + material published to QA student | Positive “own content” coverage (tests already present: 2) |
| Non-SAFE later: POST employee `role=super_admin` as plain admin | Prove `assertSuperAdminActor` reject (write — skipped here) |

---

## What was intentionally not tested

| Item | Reason |
|------|--------|
| `GET /api/lms/assignments/[id]` as student | Calls `lms_mark_assignment_viewed` (write) |
| `GET /api/mentor/my-students` for roster discovery | Calls `expire_student_mentor_assignments` |
| Creating/deleting users, tickets, submissions | SAFE MODE |
| Load testing | Out of scope |
| Production URL | Blocked by harness |

---

## Classification totals

| Category | Count | Notes |
|----------|------:|-------|
| **Confirmed application / RLS defects** | 1 | Student→other student `profiles` SELECT |
| **Harness failures** | 0 | Final run |
| **Environment / auth rate-limit** | 0 | Setup logins succeeded |
| **Blocked (missing QA data)** | 1 | Unrelated student for mentor scope |

---

## Conclusion

Phase 6 SAFE MODE completed on localhost. **Role UI/API isolation passed** for Admin/Mentor/Student portals. **One CRITICAL RLS issue:** students can read another student’s `profiles` row via direct Supabase SELECT.

**No fixes applied.** Next step (when you approve): verify live `profiles` policies and plan a controlled RLS tighten — not in this run.

---

## STOP

No further Phase 6 retries. No application/database/RLS changes. No load testing.
