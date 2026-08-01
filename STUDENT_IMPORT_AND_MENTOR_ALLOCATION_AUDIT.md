# Student Import & Mentor Allocation — AJ OS Audit

**Date:** 2026-08-01  
**Scope:** Bulk portal-student onboarding + mentor–student allocation  
**Rule:** No broad import/allocation tables or pages until this audit is complete. This document is that gate.

---

## 1. Executive verdict

AJ OS already has:

- Portal identity (`profiles` + Auth)
- Academic structure (`academic_*` + `student_enrolments`)
- **Mentor scope** allocations (`mentor_allocations` = mentor ↔ department/course/batch)
- CRM lead import patterns (`xlsx` + CSV) for **Student Master leads**, not portal students
- One-by-one user creation via Admin → User Master (`auth.admin.createUser`)

AJ OS does **not** yet have:

- Bulk **portal student** import (Auth + profile + enrolment)
- Mentor ↔ **student** assignment model with roles (primary / secondary / project / …)
- Mentor capacity / workload / transfer / temporary allocation
- Import batches, dry-run, idempotency, error-file retry

**Critical distinction (do not conflate):**

| Concept | Table / storage | Purpose today |
|---------|-----------------|---------------|
| Portal student | `profiles` where `role = 'student'` | Login + LMS |
| CRM lead | `clients` (Student Master) | Sales pipeline |
| Enrolment | `student_enrolments` | Links portal student → dept/course/batch |
| Mentor **scope** | `mentor_allocations` | What dept/course/batch a mentor may teach |
| Mentor **of student** | `profiles.assigned_mentor_id` only | Legacy single primary mentor |

The requested product needs a new **student–mentor assignment** relationship. Reuse scope allocations for LMS content access; do **not** overload `mentor_allocations` as a student list.

---

## 2. Existing features that can be reused

### 2.1 Identity & roles

| Asset | Location | Reuse |
|-------|----------|-------|
| `profiles` | `AJ_Academy_SB/schema.sql` + patches | Portal users; `id` = `auth.users.id` |
| Roles | `super_admin`, `admin`, `employee`, `student`, `freelancer`, `mentor` | RBAC |
| `is_admin()`, `get_user_role()` | `schema.sql` | API + RLS |
| `is_mentor_role()` | `aj_academy_platform_expansion.sql` / `mentor_department_tasks.sql` | Mentor gates |
| `course`, `assigned_mentor_id` on profiles | `aj_academy_platform_expansion.sql` | Text course label + legacy primary mentor |
| `phone` | `employee_details.phone` (employees); profiles may lack dedicated student phone column | Need student phone strategy (see gaps) |
| Create user | `AJ_Academy_OS/app/api/admin/employees/route.ts` | Server-side `createAdminClient` + `auth.admin.createUser` + profile upsert |
| User Master UI | `app/admin/employee-master/page.tsx` | Manual add student/mentor with password |

### 2.2 Academic structure

| Table | Script | Notes |
|-------|--------|-------|
| `academic_departments` | `lms_academic_foundation.sql` | Normalized names |
| `academic_courses` | same | FK → department |
| `academic_batches` | same | FK → course |
| `academic_modules` | same | Subjects under course |
| `student_enrolments` | same | Portal students only; unique active per student+course |
| Seed / backfill | `lms_seed_academic_from_settings`, `lms_backfill_student_enrolments` | From `system_settings.hr_org` + profile strings |
| UI | `/admin/academic/departments-courses`, `/admin/academic/catalog` | Lists + LMS catalog |
| Settings lists | `hr_org.departments[]`, `hr_org.courses[]` | Flat strings for User Master |

### 2.3 Mentor scope (already built)

| Asset | Notes |
|-------|-------|
| `mentor_allocations` | Mentor + `department_id` + optional course/batch/module + dates + `is_primary` + status |
| Statuses | `active`, `inactive`, `expired`, `revoked` |
| Helpers | `lms_mentor_has_active_allocation`, `lms_eligible_students_for_scope`, `lms_expire_mentor_allocations` |
| UI | `MentorAllocationWorkbench` — create/revoke scope; Seed from Settings |
| History | Rows kept on revoke/expire (no hard delete) |

This supports “mentor can operate in Engineering / Full Stack / Batch 2026-A”. It does **not** list named mentees.

### 2.4 Import / Excel libraries

| Asset | Location | Reuse |
|-------|----------|-------|
| `xlsx` (^0.18.5) | `AJ_Academy_OS/package.json` | Read/write Excel |
| `lib/csv.ts` | Lightweight CSV parse/build/download | CSV templates & reports |
| Student Master CRM import | `components/student-lead-master/studentMasterCsv.ts` | Header aliases, parse, export patterns (**CRM `clients` only**) |
| College visits CSV | `components/college-visits/collegeVisitsCsv.ts` | Same pattern |
| Reports export | `components/reports/reportsExport.ts`, payroll reports | Multi-sheet XLSX write |

**No** existing portal-student bulk import. CRM import must not be reused against `clients` for LMS logins.

### 2.5 Notifications & audit

| Asset | Reuse |
|-------|-------|
| `in_app_notifications` + Realtime | Post-import / allocation alerts |
| `writeAuditLog` / `audit_logs` | Import batch + capacity override + transfers |
| Push / email | Existing FCM + Resend/Zoho patterns where configured |

### 2.6 Storage

Private LMS buckets exist (`assignment-submissions`, `study-materials`, etc.). Import originals should use a **new private** bucket (e.g. `student-imports`) with signed URLs — same pattern as payslips/proposals.

### 2.7 LMS student pickers

`GET /api/lms/eligible-students` + enrolments already power assignment/project audiences. After import, students must have **active `student_enrolments`** or they will not appear in LMS audiences.

---

## 3. Incomplete / UI-only / missing

| Category | Items |
|----------|-------|
| Incomplete | Single `assigned_mentor_id`; no multi-role mentee links |
| Incomplete | Mentor allocation UI = scope only (not per-student) |
| Incomplete | Seed attaches Settings courses to a default department — mismatches common |
| UI-only | Academic year / semester / section not first-class tables |
| Missing | Portal student bulk import + dry run + history |
| Missing | Registration number / roll number on profiles |
| Missing | Student directory under Academic Management |
| Missing | Mentor capacity settings & workload dashboard |
| Missing | Mentor transfer / temporary / backup allocation |
| Missing | Post-import “allocate mentors” wizard |
| Missing | Role-permission matrix for project/placement/support mentors |

---

## 4. Existing database relationships (relevant)

```
auth.users 1—1 profiles
profiles (student) 1—* student_enrolments *—1 academic_courses
academic_departments 1—* academic_courses 1—* academic_batches
academic_courses 1—* academic_modules
profiles (mentor) 1—* mentor_allocations *—1 academic_departments
profiles.assigned_mentor_id → profiles (mentor)   -- legacy 1:1 primary
clients  -- CRM leads; NO FK to profiles
```

**Implication:** Import must create `auth.users` + `profiles` + `student_enrolments` (and resolve department/course/batch by **name → UUID**). Optionally set `assigned_mentor_id` only when a primary mentee link is created.

---

## 5. Required migrations (proposed order)

| # | Script (proposed) | Purpose |
|---|-------------------|---------|
| 1 | `student_portal_profile_fields.sql` | registration_number, mobile, gender, DOB, academic_year, year_of_study, semester, section, admission_date, etc. (only fields needed); unique registration where present |
| 2 | `student_import_batches.sql` | import batches, row results, file hash, storage path, modes, status machine |
| 3 | `student_mentor_assignments.sql` | mentor↔student with role, primary flag, dates, status, reason; uniqueness rules |
| 4 | `mentor_capacity.sql` | per-mentor caps + preferred depts/courses |
| 5 | `student_import_storage.sql` | private `student-imports` bucket + policies |
| 6 | RLS + RPCs | validate/import RPC or server-only service role; assignment transfer/expire helpers |

Do **not** store mentors as comma-separated text. Do **not** put mentees into `mentor_allocations`.

---

## 6. Existing permission model

| Role | Today |
|------|--------|
| super_admin / admin | User Master create; Academic Management; LMS admin |
| mentor | Scope via `mentor_allocations`; LMS content; sees eligible students by enrolment∩scope |
| student | Own profile/enrolments/LMS items |
| employee / freelancer | Ops/CRM; not LMS academic admin |

Import + capacity override + transfer must be **admin/super_admin** APIs with `requireAdminApiSession` / service role on server only.

---

## 7. Data-quality & security risks

| Risk | Detail |
|------|--------|
| Dual student concepts | Importing into `clients` would break LMS; must target `profiles` + Auth |
| Duplicate Auth emails | `createUser` fails if email exists — need map-to-existing policy |
| Password handling | User Master requires password today; bulk import should use invite / temp password / magic link per product decision — **must not** put passwords in Excel |
| Name-only matching | Unstable; prefer registration number + email |
| Course under wrong department | Seed quirk; validation must enforce course∈department, batch∈course |
| Scope vs mentee confusion | Mentors with dept scope already see all enrolled students — adding mentee links without tightening RLS may over-expose or under-expose |
| SheetJS CVEs | Pin/review `xlsx`; prefer server-side parse for untrusted uploads |
| Large files | Must batch; no single request for thousands of Auth creates |
| Service role leak | Only `createAdminClient` in API routes |

---

## 8. Authentication risks

- Auth user creation is already server-side — **reuse that pattern**, never from the browser.
- Bulk create needs rate limits / batching (Supabase Auth quotas).
- Email confirm currently forced `true` on User Master create — decide invite vs auto-confirm for import.
- Idempotency: same registration/email must not create a second Auth user.

---

## 9. What existing mentor allocation already covers vs gaps

| Spec need | Status |
|-----------|--------|
| Effective dates | Done on **scope** table |
| History (no delete) | Done for scope |
| Primary flag | Exists on scope (mentor’s primary dept), **not** “primary mentor of student” |
| Bulk assign mentees | Missing |
| Multiple mentors per student | Missing |
| Roles (project/placement/…) | Missing |
| Capacity | Missing |
| Transfer / temporary | Missing |
| Student sees mentors | Partial via `assigned_mentor_id` only |

---

## 10. Recommended implementation sequence

Aligned with the mandate (audit → template → import → allocation):

1. **Audit** (this document) — Done  
2. **Profile / enrolment field migration** — registration, mobile, academic metadata  
3. **Phase 1 — Template download** (live dept/course/batch sheets via `xlsx`)  
4. **Phases 2–4 — Upload, mapping, validation** (server parse)  
5. **Phases 5–6 — Import modes + dry run**  
6. **Phases 7–10 — Transactional import, idempotency, history, error retry**  
7. **Phase 11 — `student_mentor_assignments` model + RLS**  
8. **Phases 12–14 — Manual + bulk + multi-mentor**  
9. **Phases 15–18 — Capacity, co-mentor access, transfer, temporary**  
10. **Phases 19–21 — Allocation import + post-import wizard + suggestions**  
11. **Phases 22–29 — Consistency, RBAC, RLS tests, notifications, reports, performance, test matrix**

**Reuse decision:** Keep `mentor_allocations` for LMS teaching scope. Add `student_mentor_assignments` for mentoring relationships. Optionally sync primary assignment → `profiles.assigned_mentor_id` for counselling compatibility.

---

## 11. Phase gate

| Gate | Status |
|------|--------|
| Existing schema audited | **Done** |
| CRM vs portal students documented | **Done** |
| Scope vs mentee allocation documented | **Done** |
| Import libraries identified (`xlsx`, `lib/csv`) | **Done** |
| Auth create path identified | **Done** |
| Migrations proposed | **Done** |
| Ready for Phase 1 (template) | **Yes — after product confirmation of password/invite strategy** |

---

## 12. Product decisions needed before Phase 7 (import execute)

1. **Login credentials:** invite email vs admin-set temporary password (never in spreadsheet)?  
2. **Existing Auth user with same email:** link + enrol only, or fail row?  
3. **Default import mode:** create-only + skip duplicates (recommended)?  
4. **Tighten mentor RLS** after mentee assignments exist: scope-only vs assignment-only vs both?

Until those are decided, implement through **dry run** safely; block Auth writes behind explicit confirm.

---

## 13. Files referenced (audit evidence)

- `AJ_Academy_SB/schema.sql` — profiles, audit_logs, system_settings  
- `AJ_Academy_SB/aj_academy_platform_expansion.sql` — course, assigned_mentor_id  
- `AJ_Academy_SB/lms_academic_foundation.sql` — academic_* , enrolments  
- `AJ_Academy_SB/lms_mentor_allocations.sql` — mentor scope  
- `AJ_Academy_OS/app/api/admin/employees/route.ts` — Auth create  
- `AJ_Academy_OS/app/admin/employee-master/page.tsx` — manual users  
- `AJ_Academy_OS/components/student-lead-master/studentMasterCsv.ts` — CRM import pattern  
- `AJ_Academy_OS/lib/csv.ts`, package `xlsx`  
- `AJ_Academy_OS/components/lms/MentorAllocationWorkbench.tsx`  
- `AJ_Academy_OS/app/admin/academic/departments-courses/page.tsx`  
- `AJ_Academy_OS/app/admin/academic/catalog/page.tsx`  

---

**Next phase (when you say continue):** Phase 1 — downloadable student import template (Excel + CSV) generated from live academic catalog values, plus the minimal `student_portal_profile_fields` migration if required for template columns.
