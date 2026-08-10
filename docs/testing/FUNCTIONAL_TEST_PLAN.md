# AJ OS — Phase 3 Functional Test Plan

**Date:** 10 August 2026  
**Mode:** Documentation only — **do not execute destructive scenarios yet**  
**Environment for execution later:** Prefer **staging**. If only production exists, run **read-only smoke** cases only (login/page open) with real accounts you control, and skip any create/edit/delete/import/submit cases.  
**Related:** [`AJ_OS_TESTING_AUDIT.md`](./AJ_OS_TESTING_AUDIT.md) · [`PHASE_2_CODE_HEALTH_REPORT.md`](./PHASE_2_CODE_HEALTH_REPORT.md)

---

## How to use this plan

For each test case:

1. Confirm **Precondition**.
2. Follow **Steps**.
3. Compare with **Expected Result**.
4. Fill **Actual Result** and **Status** (`Pass` / `Fail` / `Blocked` / `Skipped`).
5. If Fail, set **Severity** (`CRITICAL` / `HIGH` / `MEDIUM` / `LOW`) using the guide below.

### Severity guide

| Severity | Examples |
|----------|----------|
| CRITICAL | Wrong person sees data; lost test submission; wrong grade; auth bypass |
| HIGH | Feature broken for a whole role; cannot login; cannot open assigned work |
| MEDIUM | Partial breakage; wrong filter; slow but usable |
| LOW | Typo, layout glitch, wording |

### Safety rules while executing later

| Allowed without extra approval | Needs staging + approval |
|--------------------------------|--------------------------|
| Open pages, navigate menus | Create/delete students |
| Login with known test accounts | Bulk import |
| Read-only checks | Submit real tests / assignments |
| Wrong-password rejection | Send email / push |

**Never use real student personal emails for automated or bulk testing.**

---

## Status legend (fill when executed)

| Status | Meaning |
|--------|---------|
| Pass | Matches expected |
| Fail | Does not match expected |
| Blocked | Cannot run (no access, missing data, env issue) |
| Skipped | Intentionally not run |

---

# ADMIN test cases

**Suggested routes:** `/login` → `/admin/dashboard`  
**Roles:** `admin` or `super_admin`

| Test ID | Module | User Role | Precondition | Steps | Expected Result | Actual Result | Status | Severity if failed |
|---------|--------|-----------|--------------|-------|-----------------|---------------|--------|--------------------|
| ADM-001 | Authentication | Admin | Valid admin credentials exist | 1. Open `/login` 2. Enter correct email/password 3. Submit | Redirected to admin area (e.g. `/admin/dashboard`); no error banner | | | |
| ADM-002 | Authentication | Admin | — | 1. Open `/login` 2. Enter wrong password 3. Submit | Login rejected; stays on login or shows clear error; **no** admin access | | | |
| ADM-003 | Authentication | Admin | Logged out | 1. Open `/admin/dashboard` directly without login | Redirected to `/login` (or session error); dashboard content not shown | | | |
| ADM-004 | Dashboard | Admin | Logged in as admin | 1. Open `/admin/dashboard` 2. Wait for load | Page loads without crash; main widgets/navigation visible | | | |
| ADM-005 | Academic Management | Admin | Logged in as admin | 1. Open `/admin/academic/overview` 2. Open `/admin/academic/departments-courses` 3. Open `/admin/academic/catalog` | Each page opens; no blank error screen | | | |
| ADM-006 | Academic — Tests | Admin | Logged in as admin | 1. Open `/admin/academic/tests` | Tests management UI loads; list or empty state shown (not permission error) | | | |
| ADM-007 | Academic — Queries | Admin | Logged in as admin | 1. Open `/admin/academic/queries` | Queries page loads | | | |
| ADM-008 | Academic — Mentor allocation | Admin | Logged in as admin | 1. Open `/admin/academic/mentor-allocation` | Page loads | | | |
| ADM-009 | Academic — Reports | Admin | Logged in as admin | 1. Open `/admin/academic/reports` | Reports page loads | | | |
| ADM-010 | Student Management — Directory | Admin | Logged in as admin | 1. Open `/admin/students/directory` | Student directory loads; search/filter UI present | | | |
| ADM-011 | Student Management — Search | Admin | Directory has ≥1 student (or empty OK) | 1. On directory, type a known name in search 2. Clear search | Results narrow then restore; no crash | | | |
| ADM-012 | Student Management — Bulk import page | Admin | Logged in as admin | 1. Open `/admin/students/bulk-import` | Import wizard/page loads; **do not execute import yet** | | | |
| ADM-013 | Student Management — Mentor allocation | Admin | Logged in as admin | 1. Open `/admin/students/mentor-allocation` | Allocation UI loads | | | |
| ADM-014 | Student Management — Mentor capacity | Admin | Logged in as admin | 1. Open `/admin/students/mentor-capacity` | Capacity page loads | | | |
| ADM-015 | Student Management — Reports | Admin | Logged in as admin | 1. Open `/admin/students/reports` | Reports page loads | | | |
| ADM-016 | Student Master (CRM) | Admin | Logged in as admin | 1. Open `/admin/student-master` | Student Master loads; tabs/filters visible | | | |
| ADM-017 | Reports | Admin | Logged in as admin | 1. Open `/admin/reports` | Reports workbench loads | | | |
| ADM-018 | Settings | Admin | Logged in as admin | 1. Open `/admin/settings` | Settings page loads (read-only observation OK) | | | |
| ADM-019 | Role isolation | Student account | Student credentials available | 1. Login as student 2. Manually open `/admin/dashboard` | Denied / redirected to student home; admin UI not usable | | | |
| ADM-020 | Logout / session | Admin | Logged in | 1. Sign out (UI control) 2. Open `/admin/dashboard` | Session cleared; redirected to login | | | |

---

# MENTOR test cases

**Suggested routes:** `/login` → `/mentor/dashboard`  
**Role:** `mentor`

| Test ID | Module | User Role | Precondition | Steps | Expected Result | Actual Result | Status | Severity if failed |
|---------|--------|-----------|--------------|-------|-----------------|---------------|--------|--------------------|
| MEN-001 | Authentication | Mentor | Valid mentor credentials | 1. Login with mentor account | Lands on mentor area (e.g. `/mentor/dashboard`) | | | |
| MEN-002 | Authentication | Mentor | — | 1. Wrong password | Rejected; no mentor access | | | |
| MEN-003 | Dashboard | Mentor | Logged in | 1. Open `/mentor/dashboard` | Dashboard loads | | | |
| MEN-004 | Assigned students | Mentor | Mentor has ≥0 assigned students | 1. Open `/mentor/students` | List or empty state; only permitted students (no other mentors’ private lists if policy says so) | | | |
| MEN-005 | Assignments | Mentor | Logged in | 1. Open `/mentor/learning/assignments` | Assignments page loads | | | |
| MEN-006 | Projects | Mentor | Logged in | 1. Open `/mentor/learning/projects` | Projects page loads | | | |
| MEN-007 | Tests | Mentor | Logged in | 1. Open `/mentor/learning/tests` | Tests page loads | | | |
| MEN-008 | Study materials | Mentor | Logged in | 1. Open `/mentor/learning/materials` | Materials page loads | | | |
| MEN-009 | Evaluations / submissions | Mentor | Logged in | 1. Open `/mentor/learning/submissions` | Submissions/evaluation page loads | | | |
| MEN-010 | Student queries | Mentor | Logged in | 1. Open `/mentor/learning/queries` | Queries page loads | | | |
| MEN-011 | Learning overview | Mentor | Logged in | 1. Open `/mentor/learning/overview` | Overview loads | | | |
| MEN-012 | My tasks | Mentor | Logged in | 1. Open `/mentor/my-tasks` | Tasks page loads | | | |
| MEN-013 | Profile | Mentor | Logged in | 1. Open `/mentor/profile` | Profile loads | | | |
| MEN-014 | Role isolation — Admin URL | Mentor | Logged in as mentor | 1. Open `/admin/dashboard` | Redirected away / denied; cannot use admin | | | |
| MEN-015 | Role isolation — Student URL | Mentor | Logged in as mentor | 1. Open `/student/dashboard` | Redirected away / denied | | | |

---

# STUDENT test cases

**Suggested routes:** `/login` → `/student/dashboard`  
**Role:** `student`

| Test ID | Module | User Role | Precondition | Steps | Expected Result | Actual Result | Status | Severity if failed |
|---------|--------|-----------|--------------|-------|-----------------|---------------|--------|--------------------|
| STU-001 | Authentication | Student | Valid student credentials | 1. Login | Lands on student dashboard area | | | |
| STU-002 | Authentication | Student | — | 1. Wrong password | Rejected | | | |
| STU-003 | Dashboard | Student | Logged in | 1. Open `/student/dashboard` | Dashboard loads | | | |
| STU-004 | Assignments | Student | Logged in | 1. Open `/student/learning/assignments` | Page loads; shows own assignments or empty state | | | |
| STU-005 | Projects | Student | Logged in | 1. Open `/student/learning/projects` | Page loads | | | |
| STU-006 | Tests | Student | Logged in | 1. Open `/student/learning/tests` | Page loads; lists assigned tests or empty | | | |
| STU-007 | Materials | Student | Logged in | 1. Open `/student/learning/materials` | Page loads | | | |
| STU-008 | Queries | Student | Logged in | 1. Open `/student/learning/queries` | Page loads (queries/complaints entry) | | | |
| STU-009 | Learning overview | Student | Logged in | 1. Open `/student/learning/overview` | Overview loads | | | |
| STU-010 | Profile | Student | Logged in | 1. Open `/student/profile` | Own profile loads; sensitive fields not showing other students | | | |
| STU-011 | Forgot password page | Anyone | — | 1. Open `/forgot-password` 2. Observe form (**do not submit to real email** unless test inbox) | Page loads with email form | | | |
| STU-012 | Forgot password submit | Staging only | Test inbox available | 1. Submit forgot-password for **test** email only | Success/error message appropriate; email arrives only at test inbox | | | |
| STU-013 | Role isolation — Admin | Student | Logged in as student | 1. Open `/admin/students/directory` | Denied / redirected | | | |
| STU-014 | Role isolation — Mentor | Student | Logged in as student | 1. Open `/mentor/students` | Denied / redirected | | | |
| STU-015 | Session after logout | Student | Logged in | 1. Logout 2. Open `/student/learning/tests` | Redirected to login | | | |

---

# Cross-role authorization matrix (smoke)

Execute on staging when ready. Mark Pass/Fail per cell mentally as “can access page”.

| URL | Student | Mentor | Admin |
|-----|---------|--------|-------|
| `/admin/dashboard` | Deny | Deny | Allow |
| `/admin/students/directory` | Deny | Deny | Allow |
| `/mentor/dashboard` | Deny | Allow | Deny* |
| `/mentor/students` | Deny | Allow | Deny* |
| `/student/dashboard` | Allow | Deny | Deny* |
| `/student/learning/tests` | Allow | Deny | Deny* |

\*Admin may be redirected to admin home rather than seeing mentor/student UI — that still counts as **not using** the other role’s workspace. Record actual behaviour.

Suggested case IDs: `AUTHZ-001` … `AUTHZ-006` (map to rows above).

| Test ID | Module | User Role | Precondition | Steps | Expected Result | Actual Result | Status | Severity if failed |
|---------|--------|-----------|--------------|-------|-----------------|---------------|--------|--------------------|
| AUTHZ-001 | Authorization | Student | Student logged in | Open `/admin/dashboard` | No admin access | | | |
| AUTHZ-002 | Authorization | Student | Student logged in | Open `/mentor/dashboard` | No mentor access | | | |
| AUTHZ-003 | Authorization | Mentor | Mentor logged in | Open `/admin/dashboard` | No admin access | | | |
| AUTHZ-004 | Authorization | Mentor | Mentor logged in | Open `/student/dashboard` | No student workspace | | | |
| AUTHZ-005 | Authorization | Admin | Admin logged in | Open `/admin/dashboard` | Access granted | | | |
| AUTHZ-006 | Authorization | Logged out | No session | Open any role dashboard URL | Forced to login | | | |

---

# Deferred cases (do **not** run on production yet)

These belong to later phases (7–11). Listed so you know what is coming.

| Future ID | Area | Why deferred |
|-----------|------|--------------|
| IMP-001+ | Bulk import 1→5→10 students | Writes Auth + DB |
| ALLOC-001+ | Mentor allocation writes | Changes relationships |
| ASG-001+ | Create assignment + student submit | Writes submissions |
| TST-001+ | Start test, autosave, submit | Writes attempts/answers |
| TST-CONC-001+ | Double submit / refresh near submit | Needs staging + careful checks |
| LOAD-001+ | 5→200 concurrent users | Needs staging + k6 |

---

## Execution order (when you start manual testing)

1. **AUTHZ + login failures** (safest).  
2. **Page-open smoke** for Admin → Mentor → Student (this plan’s Pass/Fail columns).  
3. Stop and report defects before any write scenarios.  
4. Only on **staging**: small write flows (Phase 7+).

---

## Accounts needed (manual)

| Role | Count | Notes |
|------|-------|-------|
| Admin | 1 | Existing admin OK for read-only smoke |
| Mentor | 1 | Prefer staging mentor |
| Student | 1–2 | Prefer staging students |

Do **not** create accounts automatically in this phase.

---

## Phase 3 complete — STOP

This file is the functional test plan only.

**Not done in this phase:**

- No Playwright install  
- No test execution against the live app by the agent  
- No database changes  
- No load tests  

### Recommended next step

**Phase 4 — Playwright preparation** (explain install impact, then wait for your approval before installing).

Reply:

- `Continue Phase 4` — Playwright prep (no install until you approve the package)  
- `I will run Phase 3 manually first` — you fill Actual/Status columns  
- `Staging ready: <URL>` — when you want load-test path later  
