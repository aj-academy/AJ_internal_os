# Mentor Attendance · Location · Camera — Implementation Audit

**Date:** 11 Aug 2026  
**Scope:** Read-only audit of AJ OS (Next.js + Supabase). **No code or schema changes in this step.**  
**Stack context:** Existing student/mentor/employee attendance punch, mentor allocation, Nominatim reverse geocode, selfie storage, Phase 6B profiles RLS.

---

## 1. Executive summary

| Requirement area | Current state | Gap |
|---|---|---|
| Mentor sees only allocated students | **Partial** — `/mentor/students` is allotment-scoped; dashboard roster is **department-wide** | Unify scoping; do not use department alone for attendance views |
| Mentor sees mentee attendance | **Missing** | No UI/API/RLS for mentor → student punches |
| Today / history tables for mentees | **Missing** | History of **own** punches exists; mentee history does not |
| Date / range filters + summary | **Missing** (for mentees) | Admin reports have patterns to reuse |
| Excel / PDF export (mentor mentees) | **Missing** | `xlsx` + `jspdf` + `jspdf-autotable` already installed |
| Human-readable location | **Partially present** | Stored as `check_in_address` via **client-side Nominatim**; UI falls back to lat/lng when address null |
| GPS accuracy | **Not stored / not shown** | `enableHighAccuracy` is on; `coords.accuracy` discarded |
| Camera auto-off after check-in | **Broken** | `stopCamera()` exists but is **not** called after successful check-in; `video.srcObject` not cleared |
| Duplicate same-day check-in | **Present** | UI guard + unique index `(employee_id, attendance_date)` |
| Selfie privacy | **Weak** | Bucket `attendance-selfies` is **public**; app stores `getPublicUrl` |
| Attendance persistence | **OK** | Rows go to `attendance_records` in Supabase (source of truth) |
| Timezone “today” | **Inconsistent** | Punch uses **browser local date**; dashboards / late mail use `todayDateIST()` (`Asia/Kolkata`) |

**Recommendation:** Reuse `attendance_records` + `student_mentor_assignments`. Prefer **no new attendance table**. Expect **one RLS migration** (mentor SELECT on mentee attendance) and optionally accuracy columns + private selfie bucket migration. Move Nominatim to a **server** route (free OSM; no new paid provider).

---

## 2. Existing tables used

### 2.1 `public.attendance_records`

**Schema:** `AJ_Academy_SB/attendance_module.sql`  
**Integrity:** `AJ_Academy_SB/hr_payroll_01_attendance_integrity.sql`  
**Selfie column:** `AJ_Academy_SB/attendance_selfie_schema.sql`

| Column | Type | Role |
|---|---|---|
| `id` | uuid PK | |
| `employee_id` | uuid → `profiles.id` | Student/mentor/employee/freelancer uid (shared model) |
| `attendance_date` | date NOT NULL | Calendar day of punch |
| `check_in_time` / `check_out_time` | timestamptz | |
| `check_in_latitude` / `check_in_longitude` | numeric | |
| `check_out_latitude` / `check_out_longitude` | numeric | |
| `check_in_address` / `check_out_address` | text | Reverse-geocode display name (nullable) |
| `location_type` | text | App always writes `"Remote"` today |
| `status` | text | e.g. `present`, `completed` |
| `total_working_minutes` | integer | Set on check-out |
| `check_in_selfie_url` | text | Public storage URL today |
| `work_summary_required` | boolean | |
| `created_at` / `updated_at` | timestamptz | |

**Not present today:** `location_name` (use `check_in_address`), `location_accuracy`, separate check-out selfie, remarks on attendance row (work summary is separate).

**Uniqueness:** `attendance_records_employee_date_uidx` on `(employee_id, attendance_date)` — one row per person per day.

**Related:** `work_summaries`, `leave_requests`, `permission_requests`, `attendance_settings`, `attendance_policies`, `attendance_corrections`.

### 2.2 Student / profile identity

**`public.profiles`** (+ `AJ_Academy_SB/student_portal_profile_fields.sql`):

Relevant fields: `full_name`, `email`, `role`, `status`, `department`, `course`, `assigned_mentor_id`, `registration_number`, `roll_number`, `section`, `academic_year`, `year_of_study`, `semester`, …

There is **no dedicated `batch` column** on profiles; “batch” in product language often maps to `department` and/or LMS catalog batches — clarify in UI mapping (recommend: show `department` as batch label when that is how ops uses it, plus LMS batch if joined later).

### 2.3 Mentor allocation

**`public.student_mentor_assignments`** — `AJ_Academy_SB/student_mentor_assignments.sql`

- Links `mentor_id` ↔ `student_id`
- Roles / primary-secondary / status (`active`, `transferred`, …)
- Helper: `sma_mentor_can_access_student(mentor, student)` — **defined but unused** by attendance
- Syncs primary into `profiles.assigned_mentor_id`

**Also exists (do not confuse):**

| Table | Purpose |
|---|---|
| `mentor_allocations` | LMS teaching scope (dept/course/batch) |
| `get_department_task_assignees()` | Same-department students for tasks/dashboard roster |

### 2.4 Selfie storage

| Item | Value |
|---|---|
| Bucket | `attendance-selfies` |
| Public? | **Yes** (`public = true` in `attendance_selfie_schema.sql`) |
| Object path | `{userId}/{YYYY-MM-DD}-checkin.jpg` |
| App URL | `supabase.storage.from(...).getPublicUrl(path)` |
| Storage RLS | Owner upload under own folder; authenticated select (tightened in `storage_rls_tighten.sql`) |

---

## 3. Existing fields — mapping to requirements

| Required concept | Existing equivalent | Action |
|---|---|---|
| `student_id` | `employee_id` | Reuse |
| `attendance_date` | `attendance_date` | Reuse; fix TZ to IST |
| `check_in_at` / `check_out_at` | `check_in_time` / `check_out_time` | Reuse |
| `status` | `status` | Reuse; map display labels |
| `latitude` / `longitude` | `check_in_*` / `check_out_*` | Reuse |
| `location_name` | `check_in_address` / `check_out_address` | Reuse; do **not** add `location_name` unless product insists |
| `location_accuracy` | **Missing** | Optional additive columns |
| `selfie_path` | `check_in_selfie_url` (full public URL) | Prefer storing **path**; signed URL at read time |
| Register / roll | `registration_number`, `roll_number` | Reuse |
| Section | `section` | Reuse |
| Mentor role / type | `student_mentor_assignments.mentor_role`, `is_primary` | Reuse |

---

## 4. Existing data flow

### 4.1 Student (and mentor **own**) check-in

```
Role /attendance page
  → MemberAttendancePage (client)
      → getTodayLocalDate()  [BROWSER LOCAL — not IST]
      → startCamera() on mount if requireSelfie
      → Check In:
          getGeoLocation() (enableHighAccuracy; no accuracy saved)
          resolveAddress() → Nominatim OPENSTREETMAP **from browser**
          captureSelfieBlob() → upload to attendance-selfies
          insert/update attendance_records
          POST /api/notifications/attendance-late
          ❌ does NOT call stopCamera()
      → Own history: select attendance_records where employee_id = me
```

**There is no check-in API route.** Punches use the Supabase browser client + RLS (`employee_id = auth.uid()`).

### 4.2 Mentor allocation data flow

```
Admin assigns → student_mentor_assignments (+ optional assigned_mentor_id sync)
  → Mentor My Students UI → GET /api/mentor/my-students (service role + mentor session)
  → Mentor Dashboard roster → get_department_task_assignees / department profiles  [BROADER]
```

### 4.3 Mentor attendance today

`/mentor/attendance` = mentor’s **personal** punch page (`MemberAttendancePage`), labeled “My Attendance” in sidebar.  
**Not** a mentee attendance console.

---

## 5. Existing mentor scoping

| Surface | Scope rule | OK for mentee attendance? |
|---|---|---|
| `/mentor/students` + `/api/mentor/my-students` | `student_mentor_assignments.mentor_id = me` | **Yes** — reuse |
| Dashboard `MentorStudentRoster` | Same department | **No** for this feature |
| Profiles RLS `profiles_mentor_students_select` | `assigned_mentor_id` **OR** same department | Broader than allotment |
| `attendance_records` RLS | Own rows + admin | Mentor **cannot** read mentee attendance |

**Do not weaken Phase 6B profiles RLS.** For attendance, add a **dedicated** mentor SELECT policy (or RPC) using `student_mentor_assignments` / `sma_mentor_can_access_student`, without reopening broad profile reads.

---

## 6. Existing location implementation

| Piece | Location |
|---|---|
| Capture | `getGeoLocation()` in `MemberAttendancePage.tsx` |
| Reverse geocode | Client `fetch` → `https://nominatim.openstreetmap.org/reverse` |
| Persist | `check_in_address` / `check_out_address` |
| Display | `AttendanceLocationBlock.tsx` — address **or** `lat, lng` fallback + Google Maps link |

### Why mentors/students often “see only lat/lng”

1. Nominatim fails or is rate-limited / blocked from browser (CORS / User-Agent / usage policy) → `address = null`.
2. UI then shows coordinates via `AttendanceLocationBlock`.
3. Geocode runs **client-side**, not via a protected server route — fragile and against OSM best practice (identifying User-Agent / server-side preferred).
4. GPS **accuracy meters** are never captured, so no “±25 m” / low-accuracy warning.

**Provider already in use:** OpenStreetMap **Nominatim** (free).  
**Google Maps:** link-only (`maps?q=lat,lng`), not Geocoding API.  
**Mapbox / HERE:** not used.

**Paid service:** Not required. Plan: keep Nominatim, move to `/api/location/reverse-geocode` with polite User-Agent, caching, and rate limits. **No new paid key needed** — proceed with free Nominatim unless you later approve Google/Mapbox.

---

## 7. Existing camera lifecycle

**File:** `AJ_Academy_OS/components/attendance/MemberAttendancePage.tsx`

| Behavior | Status |
|---|---|
| `stopCamera()` stops tracks + clears `streamRef` | Present |
| Clears `video.srcObject` | **Missing** |
| Called on unmount | Yes |
| Called before restart | Yes |
| Called after successful check-in | **No** |
| Called after capture alone | **No** (stream stays for page lifetime) |
| Explicit camera state machine | **No** (`busy` only) |
| Object URL revoke for selfie preview | **No** |

### Why the camera remains active

Camera starts when the attendance page mounts (`startCamera` in `useEffect`). After check-in succeeds, success UI is shown but **`stopCamera()` is never invoked** in `handleCheckIn` (success or error `finally`). The `MediaStream` keeps live tracks → browser camera indicator stays on. `srcObject` is also left attached.

---

## 8. Attendance history — do existing tables support it?

**Yes.** History is automatic:

- Each punch row has `attendance_date`.
- Today = `attendance_date = todayIST`.
- History = `attendance_date < todayIST` (or any range filter).
- **No nightly copy job needed.**

Mentor mentee history is blocked only by **RLS + missing UI/API**, not by schema design.

---

## 9. Excel / PDF libraries

Already in `AJ_Academy_OS/package.json`:

- `xlsx`
- `jspdf`
- `jspdf-autotable`

Reuse patterns from:

- `components/reports/reportsExport.ts`
- `app/api/admin/students/reports/route.ts`
- HR payslip PDF helpers

**Do not add another spreadsheet/PDF library.**

---

## 10. Reverse geocoding provider

| Provider | In repo? |
|---|---|
| Nominatim (OSM) | **Yes** — client-side in `MemberAttendancePage` |
| Google Geocoding API | No |
| Mapbox | No |
| HERE | No |

**Decision for implementation (pending your go-ahead on code):** reuse Nominatim via **server** route; no paid API unless you request one.

---

## 11. Existing RLS (attendance) — security risks

Current `attendance_records` policies (from `attendance_module.sql` / security fixes):

- `attendance_employee_own` — ALL where `employee_id = auth.uid()`
- `attendance_admin_read_all` — SELECT if `is_admin()`
- `attendance_admin_delete_all` — DELETE if `is_admin()`

**Gaps / risks:**

1. **No mentor mentee SELECT** — required for Part 1–4; must be allotment-scoped, **not** `USING (true)`.
2. **Public selfie bucket + public URLs** — anyone with URL can view selfie; mentor “signed URL only” not implemented.
3. **Client punch path** — workable with RLS, but harder to enforce reverse-geocode server-side and consistent IST date; consider optional server punch later (out of minimal path).
4. **Department-based dashboard roster** can leak student list broader than allotments (profiles already Phase 6B-aware; still OR department).
5. Nominatim from browser may leak student IPs to OSM and hit usage limits.

**Do not** reopen broad profiles SELECT. Prefer attendance policy:

```text
mentor can SELECT attendance_records
WHERE sma_mentor_can_access_student(auth.uid(), employee_id)
  AND status of assignment is active (as product requires)
```

Or serve mentee attendance only through a **verified** API using service role after `verifySessionRole(['mentor'])` + assignment filter (same pattern as `/api/mentor/my-students`).

---

## 12. Missing functionality (vs acceptance criteria)

1. Mentor mentee attendance Today / History pages (or tabs).
2. Mentor attendance summary KPIs for allocated students.
3. Server-side date/range filtering + pagination for mentee attendance.
4. Mentor Excel/PDF export with authz on server.
5. Camera stop after success/cancel/error paths + `srcObject = null`.
6. Camera explicit state machine.
7. Server reverse-geocode API; accuracy capture + display.
8. IST-consistent `attendance_date` on punch.
9. Mentor selfie preview via **authorized signed URL**.
10. Optional: private selfie bucket migration.
11. Automated tests for check-in / camera / mentor scope / export.
12. Sidebar IA: distinguish “My Attendance” (self) vs “Student Attendance” (mentees).

---

## 13. Required changes (planned — not done yet)

### App / API (primary files)

| File | Change |
|---|---|
| `components/attendance/MemberAttendancePage.tsx` | Camera cleanup all paths; IST date; accuracy; call server geocode; stop after success |
| New `app/api/location/reverse-geocode/route.ts` | Protected Nominatim proxy |
| New `app/api/mentor/attendance/...` (list + export) | Scoped mentee attendance + Excel/PDF |
| New mentor UI under `app/mentor/...` (e.g. student attendance Today/History) | Tables, filters, summary, selfie modal |
| `app/mentor/layout.tsx` | Nav entries |
| `components/attendance/AttendanceLocationBlock.tsx` | Show accuracy / low-accuracy warning |
| `lib/datetime.ts` | Reuse `todayDateIST` in punch path |
| Reuse `reportsExport` / xlsx+jspdf | Mentor export |
| Playwright tests under `e2e/` | New attendance / camera / mentor suite |

### SQL (if implementing mentee read via RLS)

| Migration | Purpose |
|---|---|
| New `AJ_Academy_SB/attendance_mentor_mentees_select.sql` (proposed) | Mentor SELECT mentee rows via `sma_mentor_can_access_student` |
| Optional `attendance_location_accuracy.sql` | `check_in_accuracy_m`, `check_out_accuracy_m` |
| Optional selfie privacy | Set bucket `public=false`; migrate URLs → paths; signed URL API |

**Prefer no new attendance table.**

---

## 14. Required migrations — decision matrix

| Change | Need migration? | Notes |
|---|---|---|
| Mentor read mentee attendance | **Yes** (RLS and/or API-only) | Ask before applying if you want RLS vs service-role API only |
| History | **No** | Filter existing rows |
| `location_name` column | **No** | Use `check_in_address` |
| GPS accuracy | **Optional yes** | Additive columns |
| Duplicate protection | **No** | Unique index already exists |
| Private selfies | **Recommended yes** | Bucket flag + path storage |

---

## 15. Indexes

Existing:

- `(employee_id, attendance_date)` unique  
- Additional date/employee indexes in analytics SQL  

For mentor mentee queries, typical plan:

1. Resolve mentee ids from `student_mentor_assignments` (`mentor_id, status` already indexed).
2. `attendance_records` where `employee_id IN (...)` and `attendance_date` range.

**Do not auto-create indexes.** If EXPLAIN shows seq scans at ~100–200 students × 30 days, propose:

- Confirm usage of `attendance_records_date_emp_idx` / equivalents  
- Possibly `(attendance_date, employee_id)` covering filter  

Ask before applying substantial index migrations.

---

## 16. Timezone

| Caller | “Today” source |
|---|---|
| `MemberAttendancePage` | Browser local `getTodayLocalDate()` |
| Student/Mentor dashboards | `todayDateIST()` → `Asia/Kolkata` |
| Late notification API | IST |

**Required fix:** punch `attendance_date` must use configured org timezone (default `Asia/Kolkata`), not browser local.

---

## 17. Recommended implementation order

1. ~~Audit~~ (**this document**).
2. **Camera stream cleanup** in `MemberAttendancePage` (all paths + `srcObject`).
3. **Server Nominatim** + accuracy capture + IST date on punch.
4. Verify persistence / duplicate message still works.
5. Mentor allocated-student attendance **API** (scope from assignments only).
6. Mentor **Today** table + summary.
7. Mentor **History** + date/range filters + pagination.
8. Excel export → PDF export (server authz).
9. Selfie signed preview for authorized mentors.
10. RLS migration for mentor attendance SELECT (or harden API-only path).
11. Automated tests + Phase 5/6 re-run + production build.
12. Final report.

---

## 18. Safety notes

- Do not modify production data blindly.
- Do not weaken Phase 6B profiles RLS.
- Do not invent fake mentee attendance in the UI.
- Nominatim: free; respect usage policy (server-side, identify app, cache, rate-limit).
- Stop and request approval before any paid geocoding provider or large irreversible storage migration.

---

## 19. Answers to kickoff questions

1. **Current attendance data flow** — Client punch via `MemberAttendancePage` → geolocation + client Nominatim + selfie upload → `attendance_records` insert/update; optional late-mail API. No dedicated check-in route.
2. **Current mentor allocation data flow** — Admin writes `student_mentor_assignments`; mentor lists via `/api/mentor/my-students`. Dashboard roster still department-based.
3. **Why location shows only lat/lng** — Address stored in `check_in_address` when Nominatim succeeds; UI falls back to coordinates when address is null; client Nominatim often fails; no accuracy UX.
4. **Why camera stays active** — Stream started on mount; `stopCamera()` not called after successful check-in; `srcObject` not cleared.
5. **Do tables support history?** — **Yes**; filter by `attendance_date`. No archive table needed.
6. **Excel/PDF libraries?** — **Yes** (`xlsx`, `jspdf`, `jspdf-autotable`).
7. **Reverse geocoding provider?** — **Yes** — Nominatim (client). No Google/Mapbox geocoder.
8. **Exact files needing changes** — See §13 (esp. `MemberAttendancePage.tsx`, mentor layout/pages, new mentor attendance + reverse-geocode APIs, optional SQL).
9. **DB migration required?** — **Likely yes** for mentor SELECT on mentee attendance (and optionally accuracy + private selfie bucket). **No** new attendance table.
10. **Recommended steps** — See §17.

---

## 20. Approval gates before implementation

Please confirm before coding:

1. Proceed with **Nominatim server proxy** (free) — no paid geocoding.
2. Mentor student attendance scoped **only** by `student_mentor_assignments` (not department).
3. Keep mentor **own** punch at `/mentor/attendance`; add separate **Student Attendance** nav for mentees.
4. Prefer **API + service role** and/or new RLS using `sma_mentor_can_access_student` (which approach?).
5. Optional: migrate selfie bucket to **private** + signed URLs (recommended for Part 16–17).

**Audit only — implementation not started.**
