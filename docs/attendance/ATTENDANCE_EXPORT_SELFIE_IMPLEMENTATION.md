# Attendance Export + Private Selfie Implementation

**Date:** 11 Aug 2026  
**Scope:** Mentor Excel/PDF export + private `attendance-selfies` + signed preview API.

---

## Selfie audit (before change)

| Location | Previous behavior |
|---|---|
| `MemberAttendancePage` | `getPublicUrl` → stored full public URL in `check_in_selfie_url` |
| `AttendanceSelfieThumb` | Rendered raw URL |
| Admin attendance / dashboard | Used public URL thumbs |
| Freelancer dashboard | `<img src={publicUrl}>` |
| Bucket (`attendance_selfie_schema.sql`) | `public = true` |

Column `check_in_selfie_url` held either public URL or (after this work) object path.

---

## Migration (run in Supabase)

**File:** `AJ_Academy_SB/attendance_selfies_private.sql`

1. Set bucket `public = false`
2. Best-effort rewrite public URLs → object paths
3. Storage RLS: owner folder + admin only (drop broad authenticated select)

**Rollback (not recommended):** set `public = true` again.

**App behavior if SQL not yet run:** uploads already store **path**; signed URL API still works via service role for authorized users. Public URLs of old objects may keep working until bucket is privatized.

---

## Signed URL API

`GET /api/attendance/selfie?attendanceId=`

- Auth required
- Student/employee/freelancer: own row only
- Mentor: active `student_mentor_assignments` only
- Admin: allowed
- Returns `{ url, expiresIn: 120 }` — **never stored**

---

## Mentor export

`GET /api/mentor/student-attendance/export?format=xlsx|pdf&mode=today|history&…`

- Mentor id from session
- Active allotments only
- 403 if `studentId` not allotted
- No selfie URLs in files
- UI buttons on Student Attendance page

---

## Files

| Path |
|---|
| `AJ_Academy_SB/attendance_selfies_private.sql` |
| `lib/attendance/selfieStorage.ts` |
| `app/api/attendance/selfie/route.ts` |
| `app/api/mentor/student-attendance/export/route.ts` |
| `components/attendance/AttendanceSelfieThumb.tsx` |
| `components/attendance/MemberAttendancePage.tsx` |
| `components/mentor/MentorStudentAttendanceWorkbench.tsx` |
| Admin / freelancer selfie call sites |
| Setup docs |

---

## Required SQL order (if not already applied)

1. `attendance_accuracy_meters.sql`
2. `attendance_mentor_mentees_select.sql`
3. **`attendance_selfies_private.sql`** ← this phase
