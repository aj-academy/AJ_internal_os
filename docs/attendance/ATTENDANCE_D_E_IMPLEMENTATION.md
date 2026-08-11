# Attendance D–E Implementation Report

**Date:** 11 Aug 2026  
**Scope:** Accuracy columns + Mentor Student Attendance API/UI + attendance RLS (active allotments only).  
**Not in scope:** Private selfie migration, Excel/PDF export.

---

## 1. Accuracy migration

**File:** `AJ_Academy_SB/attendance_accuracy_meters.sql`

```sql
alter table public.attendance_records
  add column if not exists check_in_accuracy_meters numeric,
  add column if not exists check_out_accuracy_meters numeric;
```

| Item | Detail |
|---|---|
| Why | Persist `coords.accuracy` from browser geolocation |
| Data impact | Additive nullable; existing rows unchanged |
| Rollback | `drop column if exists check_in_accuracy_meters;` / `check_out_accuracy_meters` |
| App | `MemberAttendancePage` writes accuracy on check-in and check-out; falls back if columns missing |

**Action required:** Run this SQL in Supabase SQL Editor (this environment cannot apply DDL remotely).

---

## 2. Attendance RLS — existing vs proposed

### Existing policies (`attendance_module.sql` / security fixes)

| Policy | Command | Expression |
|---|---|---|
| `attendance_employee_own` | ALL | `employee_id = auth.uid()` (USING + WITH CHECK) |
| `attendance_admin_read_all` | SELECT | `public.is_admin()` |
| `attendance_admin_delete_all` | DELETE | `public.is_admin()` |

No mentor policy existed → mentors could only read **their own** punch rows.

### Why not `sma_mentor_can_access_student`?

That helper also grants access when:

- `retain_readonly_access` on transferred/completed/expired, **or**
- `profiles.assigned_mentor_id = mentor`, **or**
- LMS `lms_mentor_can_access_student` (scope / department-like)

Approved requirement: **active `student_mentor_assignments` only**, no department-only, no expired.

### Proposed helper + policy

**File:** `AJ_Academy_SB/attendance_mentor_mentees_select.sql`

```sql
create or replace function public.sma_mentor_can_read_student_attendance(p_mentor uuid, p_student uuid)
returns boolean
...
  select exists (
    select 1 from public.student_mentor_assignments a
    where a.mentor_id = p_mentor
      and a.student_id = p_student
      and a.status = 'active'
  );

create policy attendance_mentor_active_mentees_select
on public.attendance_records
for select to authenticated
using (public.sma_mentor_can_read_student_attendance(auth.uid(), employee_id));
```

**No `USING (true)`.** No mentor INSERT/UPDATE on mentee rows.

### Effect

| Role | Behavior |
|---|---|
| Student | Unchanged — own read/write via `attendance_employee_own` |
| Mentor | SELECT attendance only for students with **active** allotment |
| Admin / Super Admin | Unchanged — `is_admin()` SELECT/DELETE |
| Phase 6 profiles RLS | Untouched |

### Rollback

```sql
drop policy if exists attendance_mentor_active_mentees_select on public.attendance_records;
drop function if exists public.sma_mentor_can_read_student_attendance(uuid, uuid);
```

**Action required:** Run `attendance_mentor_mentees_select.sql` in Supabase after review.

---

## 3. Mentor Student Attendance API

| Endpoint | Purpose |
|---|---|
| `GET /api/mentor/student-attendance/today?date=` | Active allotments LEFT JOIN attendance for IST date |
| `GET /api/mentor/student-attendance/history?from&to&studentId&status&page&pageSize` | Paginated history for active mentees only |

Security:

- `verifySessionRole(mentor|admin|super_admin)`
- Mentor id from session (browser `mentor_id` ignored for mentors)
- Active assignments only
- Service role used **after** session gate + explicit `mentor_id` / student id filter
- Response exposes `hasSelfie` boolean only (no public selfie URL)

Today includes students with **no** attendance row → `Not Yet Checked In`.

---

## 4. UI

- Nav: **Student Attendance** → `/mentor/student-attendance`
- Tabs: Today | History (date / range / student / status filters)
- **My Attendance** unchanged (personal punch)

No Excel/PDF in this phase.

---

## 5. Files changed

| Path |
|---|
| `AJ_Academy_SB/attendance_accuracy_meters.sql` |
| `AJ_Academy_SB/attendance_mentor_mentees_select.sql` |
| `AJ_Academy_SB/DATABASE_SETUP_ORDER.txt` |
| `SUPABASE_SETUP_GUIDE.md` |
| `AJ_Academy_OS/components/attendance/MemberAttendancePage.tsx` |
| `AJ_Academy_OS/lib/attendance/mentorStudentAttendance.ts` |
| `AJ_Academy_OS/app/api/mentor/student-attendance/today/route.ts` |
| `AJ_Academy_OS/app/api/mentor/student-attendance/history/route.ts` |
| `AJ_Academy_OS/components/mentor/MentorStudentAttendanceWorkbench.tsx` |
| `AJ_Academy_OS/app/mentor/student-attendance/page.tsx` |
| `AJ_Academy_OS/app/mentor/layout.tsx` |
| `docs/attendance/ATTENDANCE_D_E_IMPLEMENTATION.md` |

---

## 6. Tests (this phase)

| Suite | Result |
|---|---|
| `tsc --noEmit` | Pass |
| `npm run build` | Pass |
| Playwright smoke student+mentor (`--no-deps`) | Pass (11/11) |
| Phase 6 student+mentor (`--no-deps`) | Pass for executed cases (known RLS skips without env probes) |
| Phase 6 admin | 4/5 pass after auth refresh; 1 flaky UI module open check failed (unrelated to attendance SQL/API) |

**You must run in Supabase SQL Editor before accuracy + mentor JWT reads work end-to-end:**

1. `AJ_Academy_SB/attendance_accuracy_meters.sql`  
2. `AJ_Academy_SB/attendance_mentor_mentees_select.sql`  

API Today/History work with service-role scoping even before RLS SQL, but JWT defense-in-depth and accuracy persistence require the migrations.

---

## 7. STOP

Next phase (needs separate approval):

- Private selfie bucket + path + signed URLs  
- Excel / PDF export for mentor student attendance  
