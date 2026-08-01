# Student Import & Mentor Allocation — API Notes

## Prerequisites (Supabase SQL order)

1. `student_portal_profile_fields.sql`
2. `student_import_batches.sql`
3. `student_import_rows.sql`
4. `student_mentor_assignments.sql` (requires LMS `academic_*` tables)

## Student import

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/students/import/template?format=xlsx\|csv` | Live catalog template |
| POST | `/api/admin/students/import/upload` | multipart `file` → batch + storage |
| GET | `/api/admin/students/import/upload` | Recent batches |
| GET/PUT | `/api/admin/students/import/[id]/mapping` | Analyze / confirm column map |
| POST | `/api/admin/students/import/[id]/dry-run` | Validate rows; persist `student_import_rows` |
| POST | `/api/admin/students/import/[id]/execute` | Batched Auth+profile+enrolment |
| GET | `/api/admin/students/import/[id]/errors?only=errors\|failed&format=csv\|xlsx` | Error reports |
| POST | `/api/admin/students/import/[id]/cancel` | Cancel non-running batch |

### Import modes

`skip_duplicates` (default), `create_only`, `update_only`, `create_and_update`, `import_valid_skip_invalid`, `stop_on_error`

Updates require `confirmUpdateExisting: true`. Passwords / auth IDs / mentor history / grades are never overwritten from the sheet.

### Idempotency

File SHA-256 + import mode: completed fingerprint blocks re-execute (HTTP 409). Row `idempotency_key` = org|registration|academic_year.

## Mentor–student assignments

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/students/mentor-assignments` | List / `?workload=1` / `?withoutMentor=1` |
| POST | `/api/admin/students/mentor-assignments` | `action`: `assign` \| `bulk` \| `transfer` \| `suggest` |
| GET/PUT | `/api/admin/students/mentor-capacity` | Capacity settings |
| GET | `/api/mentor/my-students?role=primary\|secondary\|project` | Mentor roster |

`mentor_allocations` (Academic Management) = teaching **scope**.  
`student_mentor_assignments` = mentee **relationship**.

Capacity override requires reason; rows land in `mentor_capacity_overrides` + audit log.

Temporary assignments: set `end_date` + `is_temporary`; `expire_student_mentor_assignments()` marks expired.

## Security

- Admin APIs: `requireAdminApiSession` / service role only on server
- Mentor roster: `verifySessionRole` mentor|admin
- RLS: admins full; mentors/students select own assignment rows
- Storage: private `student-imports` bucket; upload via service role

## Rollback

See `SUPABASE_SETUP_GUIDE.md` portal student import section.
