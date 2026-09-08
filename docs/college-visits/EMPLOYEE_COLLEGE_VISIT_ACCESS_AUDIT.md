# Employee College Visit Access and File Security Audit

**Audit status:** Read-only audit completed before implementation.  
**Post-audit status:** The user subsequently approved implementation. Application changes and `college_visit_file_visibility_patch.sql` are prepared locally; the SQL/RLS migration has **not** been applied to Supabase and no bucket privacy was changed.

**Audit date:** 08 September 2026  
**Scope:** Existing Admin and Employee College Visits modules, APIs, database tables, RLS, proposal/attachment storage, creator/uploader attribution, activities, follow-ups, filters, and tests.

---

## 1. Executive findings

1. **Employee College Visits already exists.** The Employee sidebar already links to `/employee/college-visits`, and that page renders the same shared `CollegeVisitsWorkbench` used by Admin.
2. **The system is not a disconnected duplicate.** Admin and Employee use the same components, routes, tables, statuses, follow-up fields, and activity table.
3. **Admin already receives all College Visit records**, including records created by Employees, through the role-aware `GET /api/college-visits` route and Admin RLS.
4. **Employee record visibility is already restricted** to owned/created/task-linked or pinned visits, depending on the entry path.
5. **Visits already store `created_by`, `created_at`, `assigned_to`, and `assigned_by`.** New records created through the API force `created_by` and `assigned_to` from the authenticated session.
6. **The UI does not currently show Created By as a dedicated table field or role badge.**
7. **Multi-file proposal records already store `uploaded_by` and `uploaded_at`.** They do not store visibility or uploader-role snapshot.
8. **Uploader name and role are not currently returned/displayed.** The shared proposal file component shows only file name and size.
9. **Modern proposal files use the private `proposals` bucket and short-lived signed URLs**, which is the correct storage foundation.
10. **Modern proposal APIs have a critical authorization defect:** they use the service role after checking only that the caller is staff. List, sign, upload, and remove do not consistently prove that the caller may access that College Visit.
11. **`proposal_files` RLS is too broad.** Any Employee can directly select all proposal-file metadata because its current policy is `is_admin() OR is_employee()` with no entity or visibility restriction.
12. **Admin-uploaded files are not hidden from Employees today.** An Employee who can open an Admin-created/task-linked visit receives its proposal metadata and can request a signed URL. A staff user who knows identifiers may also exploit the proposal APIs.
13. **Legacy College Visit proposal URLs are public.** The old `college-visit-proposals` bucket is public and legacy `proposal_pdf_url`/`proposal_link` fields are rendered directly.
14. **WhatsApp outreach attachments are also public.** They use public `task-attachments` URLs because WhatsApp deep links cannot transfer binary attachments. This is a separate security/migration decision from proposal documents.
15. The safest durable design is an explicit `visibility_scope` on `proposal_files`, set only by the server:
    - Admin College upload → `admin_only`
    - Employee College upload → `admin_employee`
16. To hide Admin file events as required, `college_visit_activities` also needs a visibility scope, or file events must be synthesized from authorized file records. Adding an activity visibility column is the simpler and more auditable option.
17. **No database/RLS/Storage changes have been applied.** The exact proposed migration is included below for approval.

---

## 2. Current Admin College Visits architecture

### Entry point

- `AJ_Academy_OS/app/admin/college-visits/page.tsx`
  - Renders `<CollegeVisitsWorkbench role="admin" />`.
- `AJ_Academy_OS/app/admin/layout.tsx`
  - Contains the Admin College Visits navigation entry.
  - Admin layout authorization is enforced through `requireRole(["super_admin", "admin"])`.

### Shared workbench

- `AJ_Academy_OS/components/college-visits/CollegeVisitsWorkbench.tsx`
  - Main College Visit UI for both portals.
  - Loads visits through `GET /api/college-visits`.
  - Handles create/edit, search, filters, pagination, import folders, outreach, proposals, activities, CSV export, task assignment, and tab routing.
- `AJ_Academy_OS/components/college-visits/CollegeVisitsSubsections.tsx`
  - Overview, follow-ups, pipeline, converted colleges, MOU, proposal tracker, activity timeline, reports, and settings panels.
- `AJ_Academy_OS/components/college-visits/CollegeVisitFormPanel.tsx`
  - Shared Add/Edit form.
- `AJ_Academy_OS/components/shared/ProposalFileUpload.tsx`
  - Shared Student Master and College Visits proposal file UI.

### Current Admin behavior

- Admin `GET /api/college-visits` is not owner-filtered and returns all College Visit records.
- Admin RLS grants full access through `public.is_admin()`.
- Admin-only UI includes import batches, duplicate preview, settings, reports, bulk task assignment, employee tracker, and pipeline-stage administration.
- Admin can already open Employee-created visits because the Admin API query and RLS are company-wide.
- Admin does not currently get a dedicated **Created By** column or uploader identity in the file list.

---

## 3. Existing Employee College Visits support

Employee support is already substantial and should be hardened rather than recreated.

### Existing page and navigation

- `AJ_Academy_OS/app/employee/layout.tsx`
  - Already contains `{ label: "College Visits", href: "/employee/college-visits" }`.
- `AJ_Academy_OS/app/employee/college-visits/page.tsx`
  - Already renders `<CollegeVisitsWorkbench role="employee" fullAccess />`.
- The Employee layout requires the `employee` role.

### Existing Employee functionality

Employees currently have:

- Shared College Visits design and most shared tabs.
- Search, status/priority/follow-up filtering, and pagination.
- Add College.
- Edit UI for visible records.
- Follow-ups, call outcome, WhatsApp, email, and activity history.
- Proposal upload/list/open/remove UI.
- CSV export.
- Task-linked College Visit access and CRM pin integration.

Employees do not receive:

- Import/batch administration.
- Reports or Settings tabs.
- Admin employee tracker controls.
- Bulk task assignment.
- Admin delete UI.

### Current UI mismatch

`fullAccess` makes the Employee workbench's UI-level `isAdmin` flag true while `isDbAdmin` remains false. This allows shared create/edit controls but can expose controls whose server routes are Admin-only.

Example: the recently added save-location dialog defaults to **Create new folder**, but `/api/college-visits/import` is Admin-only. Employee Add College must therefore skip folder creation or default to **All Colleges** unless Employee folder creation is separately approved.

---

## 4. Existing College Visit database tables

### `public.college_visits`

Defined initially in:

- `AJ_Academy_SB/college_visits_schema.sql`

Important existing columns:

- `id`
- `college_name`
- `location`
- `visit_date`
- `visit_status`
- `last_follow_up_date`
- `next_follow_up_date`
- `follow_up_stage`
- `assigned_to`
- `assigned_by`
- `created_by`
- `created_at`
- `updated_at`
- proposal fields added by later patches
- `import_batch_id` added by the import-batch patch

Creator identity is therefore already normalized through `profiles(id)`. No `created_by_user_id`, `created_by_name`, or `created_by_role` duplicate columns are required.

### `public.college_visit_activities`

Existing fields:

- `id`
- `college_visit_id`
- `activity_type`
- `notes`
- `old_value`
- `new_value`
- `created_by`
- `created_at`

The activity actor is already normalized through `created_by`. Current activity records do not store role snapshot or visibility.

### Import tables

- `public.college_visit_import_batches`
- `public.college_visit_import_rows`

These tables are Admin-only under RLS. Uploaded spreadsheet binaries are not stored in Supabase Storage; parsed rows and file metadata are stored in the database.

---

## 5. Existing attachment schemas

College Visits currently has four file/link surfaces.

### A. Current multi-file proposals

Table:

- `public.proposal_files`
- Defined in `AJ_Academy_SB/proposals_multi_file_patch.sql`
- Shared by Student Master (`entity_type = 'student'`) and College Visits (`entity_type = 'college'`)

Existing fields:

- `id`
- `entity_type`
- `entity_id`
- `file_name`
- `file_path`
- `file_type`
- `file_size`
- `uploaded_at`
- `uploaded_by`

What is missing:

- No `visibility_scope`
- No uploader role snapshot
- No database foreign key from polymorphic `entity_id` to `college_visits`

`uploaded_by` is sufficient for uploader identity. Name and current role should be resolved from `profiles`; they should not be copied into every file row.

### B. Legacy single-file columns on `college_visits`

Added by `proposals_file_upload_patch.sql`:

- `proposal_file_name`
- `proposal_file_path`
- `proposal_file_type`
- `proposal_file_size`
- `proposal_uploaded_at`

These fields do **not** include uploader identity or visibility. They mirror the latest uploaded file for backward compatibility.

### C. Legacy external/public proposal fields

Added by `college_visits_proposal_patch.sql`:

- `proposal_link`
- `proposal_pdf_url`
- `proposal_pdf_name`

These may point to the public legacy bucket or to an external URL. The current UI renders them directly.

### D. WhatsApp outreach attachments

- Stored in the public `task-attachments` bucket.
- Object path: `{authenticated-user-id}/outreach/{timestamp}-{file-name}`.
- Public URL is appended to the WhatsApp text and recorded in activity notes.
- This is not represented in `proposal_files`.

---

## 6. Current created-by and uploaded-by behavior

### Visit creator

Current server create flow:

- `POST /api/college-visits`
- Authenticates with `requireStaffApiSession()`.
- Forces `payload.assigned_to = user.id`.
- Inserts `created_by = user.id`.
- Does not trust a browser-supplied creator.
- Creates a `College Created` activity with `created_by = user.id`.

Admin import execution also sets imported records and creation activities to the authenticated Admin user.

Current gap:

- `created_by` and `created_at` are selected by the API but are not shown as dedicated College Visit table columns.
- The profile query in `CollegeVisitsWorkbench.tsx` currently selects `id, full_name, email`, not `role`.
- There is no current **Created By: Name [Role]** presentation or creator filter.

### File uploader

Current upload flow:

- `/api/proposals/upload` sets `proposal_files.uploaded_by = authenticated user.id`.
- `uploaded_at` uses its database default.
- The browser cannot currently set `uploaded_by` through the standard upload request.

Current gaps:

- `/api/proposals/list` returns only uploader ID, not uploader name/role.
- `ProposalFileUpload.tsx` displays only file name and size.
- No visibility is recorded.
- Legacy single-file columns do not record uploader.
- Upload/remove actions are not consistently written to `college_visit_activities`.

---

## 7. Current record visibility and RLS

Effective College Visit isolation is defined in:

- `AJ_Academy_SB/crm_owner_isolation.sql`

### Admin

Admin can select, insert, update, and delete all College Visits and activities.

### Employee

Employee/non-Admin College Visit SELECT and UPDATE are permitted when at least one is true:

- `assigned_to = auth.uid()`
- `created_by = auth.uid()`
- `public.task_links_college(id)`

Employee DELETE is limited to:

- `assigned_to = auth.uid()`
- `created_by = auth.uid()`

Activities inherit access from the parent College Visit.

### API list behavior

`GET /api/college-visits`:

- Admin: all rows.
- Employee: initially filters `assigned_to = authenticated user`.
- Then merges pinned College Visit IDs through the CRM pin path.

RLS permits `created_by` and task-linked access more broadly than the initial Employee API filter. The pin/task flows compensate for some of this, but the authorization rule should eventually be centralized so API and RLS cannot drift.

### Required Admin visibility

No new RLS change is required for Admin to see Employee-created visits. Admin already sees all rows.

Required work is:

- Preserve existing Admin query/RLS.
- Add creator attribution to the response/UI.
- Add creator filters.
- Add tests proving Employee-created visits appear to Admin.

---

## 8. Current file access security

### Modern `proposals` bucket

Defined in:

- `AJ_Academy_SB/proposals_file_upload_patch.sql`

Current properties:

- Private bucket (`public = false`)
- PDF/DOC/DOCX only
- 10 MB limit
- Direct authenticated Storage policies allow Admin only
- Employee file operations go through server APIs using the Supabase service role
- Signed URL lifetime is 120 seconds

The private bucket is correct and should remain private.

### Critical service-role API defect

Affected routes:

- `AJ_Academy_OS/app/api/proposals/upload/route.ts`
- `AJ_Academy_OS/app/api/proposals/list/route.ts`
- `AJ_Academy_OS/app/api/proposals/signed-url/route.ts`
- `AJ_Academy_OS/app/api/proposals/remove/route.ts`

All require a staff session, but:

- Upload checks only whether the entity exists.
- List performs no College Visit authorization check.
- Signed URL performs no College Visit authorization or path ownership check.
- Remove performs no College Visit authorization check.
- Service-role calls bypass database and Storage RLS.

Result:

- An Employee with an entity/file identifier can request metadata, a signed URL, upload, or deletion outside their authorized College Visits.
- Hiding a button in React would not fix this.

### Broad `proposal_files` RLS

Current policy:

```sql
using (public.is_admin() or public.is_employee())
```

This allows every authenticated Employee to directly query every `proposal_files` row, including Admin file names, paths, uploader IDs, and timestamps.

### Legacy public proposal bucket

`college-visit-proposals` is explicitly public in:

- `AJ_Academy_SB/college_visits_proposal_patch.sql`

Its public object URLs cannot enforce Employee-versus-Admin visibility. Existing records using `proposal_pdf_url` may therefore remain publicly retrievable.

### Public outreach attachments

`task-attachments` is public. Its authenticated Storage policies are owner-scoped, but public URLs bypass those policies.

Strict rule consequence:

> A public or bearer URL cannot distinguish an Employee from an external WhatsApp recipient.

If the requirement applies to outreach files as well as proposal documents, the current WhatsApp-link model conflicts with the requirement that Employees must be denied even when manually opening the URL. This requires a separate product/security decision before changing the bucket.

---

## 9. Gap against the requested behavior

| Requirement | Current status | Required change |
|---|---|---|
| Same Employee College Visits module | Already exists | Harden shared workbench; do not duplicate |
| Admin sees Employee-created visits | Already works | Add creator display/filter and test |
| Employee adds College Visits | Exists, but folder dialog can lead to Admin-only API | Employee create should use All Colleges or an approved Employee folder rule |
| Visit Created By name and role | ID exists; UI absent | Resolve profile and render badge |
| File Uploaded By name and role | Uploader ID exists for multi-file rows; UI absent | Enrich authorized list response and render badge |
| Admin sees all College files | Mostly works | Preserve through Admin authorization branch |
| Employee cannot see Admin uploads | Does not work | Add explicit visibility, API checks, RLS, response shaping |
| Employee cannot obtain Admin file metadata | Does not work | Filter server response and tighten `proposal_files` RLS |
| Employee cannot obtain signed Admin file URL | Does not work | Verify entity + file + visibility before signing |
| Employee cannot manipulate creator/uploader/visibility | Creator/uploader mostly server-derived; visibility absent | Reject/ignore ownership fields; visibility always derived server-side |
| Restricted upload hidden from timeline | Does not work once upload events are added | Add activity visibility and RLS/API filtering |
| Private restricted storage | Modern proposals yes; legacy/outreach no | Keep modern private; separately migrate legacy/outreach |

---

## 10. Recommended target architecture

### Record authorization

Keep the existing shared College Visit record rule:

- Admin/Super Admin: all records.
- Employee: records they created, own, or can access through an assigned College Visit task/pin.
- Mentor/Student: unchanged.

Create one server-side access helper used by every College Visit file route. It must derive user ID and role from the authenticated session and must never trust browser-supplied role/user fields.

### File authorization

Use existing `proposal_files.uploaded_by` plus a new explicit:

```text
visibility_scope:
  admin_only
  admin_employee
```

Server defaults:

- Admin/Super Admin upload to a College Visit → `admin_only`
- Employee upload to a College Visit → `admin_employee`
- Student Master proposal behavior → unchanged (`admin_employee`) because `proposal_files` is shared

Why explicit visibility is safer than deriving from the uploader's current role:

- Profile roles may change after upload.
- Authorization remains stable after role changes.
- Legacy/unknown uploads can fail closed.
- Admin can audit the intended visibility directly.

No duplicated uploader-name column is recommended. Resolve:

- `uploaded_by` → `profiles.full_name`
- `uploaded_by` → `profiles.role`

If the product later requires the historical role at upload time, add a role snapshot only after that requirement is confirmed. It is not required for authorization when `visibility_scope` exists.

### Signed URLs

- Keep `proposals` private.
- Signed URL API validates:
  1. Authenticated session.
  2. Authorized College Visit.
  3. Requested `proposal_files` row belongs to the supplied entity.
  4. Object path starts with `colleges/{entityId}/`.
  5. Admin may sign all files.
  6. Employee may sign only `admin_employee`.
- Prefer `fileId` over accepting an arbitrary `filePath` from the browser.
- Continue using short expiration.

### API response shaping

Employee responses must never contain hidden:

- file row
- file name
- file path
- uploader
- upload timestamp
- legacy direct URL
- file-specific activity details

For Employees, `/api/college-visits` and `/api/tasks/linked-crm` must not blindly return the latest legacy single-file columns. They should overlay only the newest authorized file or null those fields.

Admin response shape remains backwards compatible and complete.

### Activity visibility

File upload/remove activity should be written server-side:

- Admin-only file event → `visibility_scope = 'admin_only'`
- Employee-visible file event → `visibility_scope = 'admin_employee'`
- Existing/general visit events → `admin_employee`

Employee activity queries must exclude `admin_only` rows at RLS/API level.

---

## 11. Exact proposed SQL — NOT APPLIED

Proposed new file:

- `AJ_Academy_SB/college_visit_file_visibility_patch.sql`

Post-audit implementation note: the created migration also reconciles existing private
`college_visits.proposal_file_*` metadata into `proposal_files` as `admin_only` when no
uploader can be proven, then clears that legacy private-path mirror. This prevents a
direct Employee query of an otherwise visible `college_visits` row from leaking an
Admin object's private Storage path. The migration file is the final SQL source of truth.

This draft intentionally preserves current Student Master proposal access while tightening College Visit files.

```sql
-- AJ OS College Visit file visibility and activity privacy.
-- PROPOSAL ONLY: not applied.
-- Run after:
--   college_visits_schema.sql
--   crm_owner_isolation.sql
--   proposals_file_upload_patch.sql
--   proposals_multi_file_patch.sql

begin;

-- One access predicate shared by RLS and role-aware server routes.
create or replace function public.can_access_college_visit(p_college_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.college_visits cv
    where cv.id = p_college_visit_id
      and (
        public.is_admin()
        or cv.assigned_to = auth.uid()
        or cv.created_by = auth.uid()
        or public.task_links_college(cv.id)
      )
  );
$$;

revoke all on function public.can_access_college_visit(uuid) from public;
grant execute on function public.can_access_college_visit(uuid) to authenticated;

-- Fail closed when a service-role insert forgets to set visibility.
alter table public.proposal_files
  add column if not exists visibility_scope text;

-- Preserve Student Master behavior.
update public.proposal_files
set visibility_scope = 'admin_employee'
where visibility_scope is null
  and entity_type = 'student';

-- Best available backfill for existing College Visit files:
-- current Employee uploader => shared; Admin/unknown uploader => Admin only.
-- The historical role at upload time was not stored, so unknown records fail closed.
update public.proposal_files pf
set visibility_scope = case
  when exists (
    select 1
    from public.profiles p
    where p.id = pf.uploaded_by
      and lower(btrim(coalesce(p.role::text, ''))) = 'employee'
  ) then 'admin_employee'
  else 'admin_only'
end
where pf.visibility_scope is null
  and pf.entity_type = 'college';

alter table public.proposal_files
  alter column visibility_scope set default 'admin_only';

alter table public.proposal_files
  alter column visibility_scope set not null;

do $$
begin
  alter table public.proposal_files
    add constraint proposal_files_visibility_scope_check
    check (visibility_scope in ('admin_only', 'admin_employee'));
exception
  when duplicate_object then null;
end $$;

create index if not exists proposal_files_college_visibility_idx
  on public.proposal_files (entity_id, visibility_scope, uploaded_at desc)
  where entity_type = 'college';

-- Replace broad metadata policies.
drop policy if exists proposal_files_staff_select on public.proposal_files;
drop policy if exists proposal_files_staff_insert on public.proposal_files;
drop policy if exists proposal_files_staff_delete on public.proposal_files;
drop policy if exists proposal_files_admin_all on public.proposal_files;
drop policy if exists proposal_files_employee_select_scoped on public.proposal_files;
drop policy if exists proposal_files_employee_insert_scoped on public.proposal_files;
drop policy if exists proposal_files_employee_delete_own on public.proposal_files;

create policy proposal_files_admin_all
on public.proposal_files
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy proposal_files_employee_select_scoped
on public.proposal_files
for select to authenticated
using (
  public.is_employee()
  and (
    -- Preserve current Student Master policy in this College-only patch.
    entity_type = 'student'
    or (
      entity_type = 'college'
      and visibility_scope = 'admin_employee'
      and public.can_access_college_visit(entity_id)
    )
  )
);

create policy proposal_files_employee_insert_scoped
on public.proposal_files
for insert to authenticated
with check (
  public.is_employee()
  and uploaded_by = auth.uid()
  and visibility_scope = 'admin_employee'
  and (
    entity_type = 'student'
    or (
      entity_type = 'college'
      and public.can_access_college_visit(entity_id)
    )
  )
);

create policy proposal_files_employee_delete_own
on public.proposal_files
for delete to authenticated
using (
  public.is_employee()
  and uploaded_by = auth.uid()
  and visibility_scope = 'admin_employee'
  and (
    entity_type = 'student'
    or (
      entity_type = 'college'
      and public.can_access_college_visit(entity_id)
    )
  )
);

-- Activity privacy is needed so Admin-only file names do not leak in timeline rows.
alter table public.college_visit_activities
  add column if not exists visibility_scope text;

update public.college_visit_activities
set visibility_scope = 'admin_employee'
where visibility_scope is null;

alter table public.college_visit_activities
  alter column visibility_scope set default 'admin_employee';

alter table public.college_visit_activities
  alter column visibility_scope set not null;

do $$
begin
  alter table public.college_visit_activities
    add constraint college_visit_activities_visibility_scope_check
    check (visibility_scope in ('admin_only', 'admin_employee'));
exception
  when duplicate_object then null;
end $$;

drop policy if exists college_visit_activities_own on public.college_visit_activities;
drop policy if exists college_visit_activities_employee_select_scoped on public.college_visit_activities;
drop policy if exists college_visit_activities_employee_insert_scoped on public.college_visit_activities;

create policy college_visit_activities_employee_select_scoped
on public.college_visit_activities
for select to authenticated
using (
  not public.is_admin()
  and visibility_scope = 'admin_employee'
  and public.can_access_college_visit(college_visit_id)
);

create policy college_visit_activities_employee_insert_scoped
on public.college_visit_activities
for insert to authenticated
with check (
  not public.is_admin()
  and visibility_scope = 'admin_employee'
  and created_by = auth.uid()
  and public.can_access_college_visit(college_visit_id)
);

commit;
```

### Important SQL review note

The activity policies are intentionally stricter than the current `FOR ALL` policy. Employees may read visible activities and insert shared activities attributed to themselves, but cannot rewrite or delete audit history. Existing application activity writes are inserts using the authenticated user. Admin operations continue through the existing Admin policy.

### Preflight counts required before approval

The repository cannot determine live production row counts. Run read-only queries first:

```sql
select entity_type, count(*) from public.proposal_files group by entity_type;

select
  case
    when uploaded_by is null then 'unknown'
    when lower(btrim(coalesce(p.role::text, ''))) = 'employee' then 'employee'
    when lower(btrim(coalesce(p.role::text, ''))) in ('admin', 'super_admin') then 'admin'
    else 'other'
  end as uploader_class,
  count(*)
from public.proposal_files pf
left join public.profiles p on p.id = pf.uploaded_by
where pf.entity_type = 'college'
group by 1;

select count(*) as legacy_college_file_rows
from public.college_visits
where proposal_pdf_url is not null
   or proposal_link is not null
   or proposal_file_path is not null;
```

---

## 12. Current behavior, new behavior, impact, and rollback

### Current behavior

- Admin sees all visits.
- Employee sees authorized visits.
- Admin and Employee can upload through shared proposal APIs.
- Any staff user can call proposal APIs for arbitrary known entity/file identifiers.
- Any Employee can query all `proposal_files` metadata.
- Admin files are visible to Employees who can access the visit.
- Legacy proposal and outreach URLs may be public.

### New behavior after approved implementation

- Admin sees all visits and all files.
- Employee sees only authorized visits.
- Admin College upload defaults to `admin_only`.
- Employee College upload is forced to `admin_employee`.
- Employee cannot list, sign, preview, download, or delete Admin-only files.
- Hidden file metadata is absent from Employee API responses.
- Hidden file events are absent from Employee timelines.
- Admin sees creator and uploader name/role.
- Employee sees creator and permitted uploader attribution.
- Browser-supplied creator/uploader/visibility values are ignored or rejected.

### Existing-data impact

- Existing multi-file College uploads by a currently active Employee can be backfilled to `admin_employee`.
- Existing Admin or unknown College file uploads become `admin_only`.
- Existing Student Master proposal files remain shared to avoid scope creep.
- Legacy `proposal_file_path` rows without a corresponding `proposal_files` row have no uploader evidence and must fail closed for Employees until reconciled.
- Public `proposal_pdf_url` and outreach URLs remain exposed until separately migrated.
- Existing general activity rows remain `admin_employee`.

### Rollback

Before migration:

- Export policy definitions and preflight counts.
- Back up `proposal_files` and relevant College Visit proposal metadata.

Database rollback:

1. Drop the new scoped policies.
2. Restore `proposal_files_staff_select/insert/delete` from `proposals_multi_file_patch.sql`.
3. Restore `college_visit_activities_own` from `crm_owner_isolation.sql`.
4. Drop the new indexes/constraints/columns only if data loss is accepted.
5. Drop `can_access_college_visit(uuid)` only after all policies/routes stop using it.

Application rollback:

- Revert the implementation commit.
- Admin behavior remains the baseline.

Storage rollback:

- No `proposals` bucket change is proposed; it stays private.
- If a later legacy-bucket migration is performed, retain a manifest mapping old URLs to new object paths before changing privacy.

---

## 13. Required application changes after approval

### Shared authorization and attribution

**Create**

- `AJ_Academy_OS/lib/college-visits/access.ts`
  - Server-only College Visit authorization.
  - Session-derived Admin/Employee decision.
  - File visibility predicate.
  - Object-path/entity validation.
- `AJ_Academy_OS/lib/college-visits/fileVisibility.ts`
  - Shared types/constants for `admin_only` and `admin_employee`.

### Proposal APIs

**Modify**

- `AJ_Academy_OS/app/api/proposals/upload/route.ts`
  - Replace existence-only check with entity authorization.
  - Derive uploader and role from session.
  - Force visibility by role.
  - Reject browser ownership/visibility manipulation.
  - Log role-aware File Uploaded activity for College entities.
- `AJ_Academy_OS/app/api/proposals/list/route.ts`
  - Authorize parent entity.
  - Filter in server/database query before returning.
  - Resolve uploader profile.
  - Never return Admin-only metadata to Employees.
- `AJ_Academy_OS/app/api/proposals/signed-url/route.ts`
  - Accept/resolve a file row, not an arbitrary path.
  - Verify entity, path prefix, and visibility before signing.
- `AJ_Academy_OS/app/api/proposals/remove/route.ts`
  - Authorize parent and file.
  - Employee removal limited to permitted own uploads unless approved otherwise.
  - Write role-aware File Removed activity.

Because proposal APIs are shared with Student Master, every change must explicitly preserve `entity_type = 'student'` behavior.

### College Visit API response shaping

**Modify**

- `AJ_Academy_OS/app/api/college-visits/route.ts`
  - Preserve Admin all-record behavior.
  - Add creator profile attribution.
  - For Employees, remove/overlay unauthorized legacy single-file metadata.
- `AJ_Academy_OS/app/api/tasks/linked-crm/route.ts`
  - Sanitize College Visit file metadata for Employee responses.
- `AJ_Academy_OS/app/api/college-visits/[id]/activities/route.ts`
  - Include actor role/name if server-enriched.
  - Ensure Employee receives only shared activities.
- `AJ_Academy_OS/app/api/college-visits/[id]/route.ts`
  - Keep creator/owner fields server-controlled.
  - Preserve current append-only outcome and task-linked update behavior.

### Shared UI

**Modify**

- `AJ_Academy_OS/components/college-visits/CollegeVisitsWorkbench.tsx`
  - Keep shared workbench.
  - Add Created By and Created At columns.
  - Add Admin creator filter.
  - Add date-range filter.
  - Use role-aware file data only.
  - Fix Employee Add College location flow so it does not call Admin-only folder creation.
- `AJ_Academy_OS/components/college-visits/CollegeVisitsSubsections.tsx`
  - Show creator/role in detail views.
  - Use authorized files only.
  - Render role-aware timeline attribution.
- `AJ_Academy_OS/components/shared/ProposalFileUpload.tsx`
  - Display uploaded-by name, role, upload date, type, and Admin visibility.
  - Do not perform client-only security filtering.
- `AJ_Academy_OS/lib/proposalFiles.ts`
  - Add visibility and uploader attribution types.
- `AJ_Academy_OS/components/college-visits/collegeVisitsHelpers.ts`
  - Add typed creator attribution without removing current fields.
- `AJ_Academy_OS/lib/collegeVisitsApi.ts`
  - Map additive creator fields safely.

### Navigation

No Employee navigation file change is required because College Visits is already present in:

- `AJ_Academy_OS/app/employee/layout.tsx`

No new Employee College Visits page is required because it already exists.

### SQL/docs/tests

**Create after approval**

- `AJ_Academy_SB/college_visit_file_visibility_patch.sql`
- College Visit file authorization tests under the existing Playwright/e2e structure.

**Modify after implementation**

- `AJ_Academy_SB/DATABASE_SETUP_ORDER.txt`
- `SUPABASE_SETUP_GUIDE.md`

---

## 14. Legacy Storage migration assessment

### Current buckets

| Bucket | Privacy | Current use |
|---|---|---|
| `proposals` | Private | Current Student/College proposal uploads |
| `college-visit-proposals` | Public | Legacy College proposal PDFs/URLs |
| `task-attachments` | Public | Tasks and WhatsApp outreach links |

### Recommended safe sequence for legacy College proposals

Do not make the legacy bucket private immediately.

1. Inventory existing `proposal_pdf_url` rows.
2. Parse and validate object paths that belong to `college-visit-proposals`.
3. Copy each object into `proposals/colleges/{college_visit_id}/...`.
4. Create `proposal_files` rows.
5. Backfill uploader when provable; otherwise mark `admin_only`.
6. Verify Admin preview/download.
7. Verify Employee shared-file behavior on test rows.
8. Replace legacy row URLs with private object metadata.
9. Only then remove broad read policy and set the legacy bucket private.
10. Retain migration manifest and backup for rollback.

Privacy switch after object migration and approval:

```sql
begin;

update storage.buckets
set public = false
where id = 'college-visit-proposals';

drop policy if exists college_visit_proposals_storage_read on storage.objects;

commit;
```

This SQL alone is **not sufficient**; running it before copying/relinking objects can break existing Admin files.

### Outreach attachment decision

Do not include `task-attachments` in the proposal migration automatically.

Options requiring product approval:

1. Keep WhatsApp outreach files public and treat them as externally shared, not internal College Visit files.
2. Move them private and stop sending durable file URLs through WhatsApp.
3. Introduce a separate externally shareable token/download service with expiry and revocation.

Strict authenticated role denial cannot coexist with a permanently public external URL.

---

## 15. Admin and Employee UI target

### Admin College table

Retain existing fields and add:

- Created By: `Full Name` + `Admin`/`Employee` badge
- Created At

Retain:

- College Name
- Location
- Visit Date
- Status
- Assigned Employee/task owner
- Last Follow-up
- Next Follow-up
- Actions

Admin filters:

- Existing search
- Creator category: All/Admin/Employee
- Specific creator/employee
- Status
- Date range
- Next follow-up

Do not replace the existing Owner/assignment filter with Creator; they are different concepts.

### Admin file list

For each authorized file:

- File Name
- File Type
- Uploaded By
- Uploader Role badge
- Uploaded At
- Visibility
- Preview/Download/Remove actions

Admin sees both `admin_only` and `admin_employee`.

### Employee table

Reuse the same workbench and show:

- College Name
- Visit Date
- Location
- Status
- Assigned Employee
- Created By
- Last Follow-up
- Next Follow-up
- Actions

Employee creator attribution may show Admin because record visibility and file visibility are separate.

Employee file APIs return only `admin_employee`; the UI must not receive and hide Admin-only rows.

---

## 16. Activity timeline changes

Current timeline supports:

- College Created
- College Updated
- Tracked field updates
- Manual outreach activities

Current gaps:

- File upload/remove is not consistently logged.
- Role is not displayed as a badge.
- Assignment ownership and task assignment are represented through different paths.
- Restricted file events have no visibility protection.

After approval:

- File Uploaded and File Removed events originate from secured server routes.
- Event actor is authenticated user.
- Admin-only file events are `admin_only`.
- Employee upload events are `admin_employee`.
- Employee direct activity queries are filtered by RLS before React sees them.
- General status/follow-up events remain shared for authorized visit viewers.

---

## 17. Regression risks

1. **Student Master proposal regression**
   - `proposal_files` and `/api/proposals/*` are shared.
   - Every API and SQL change must preserve Student behavior.
2. **Task-linked College Visit regression**
   - Employees currently edit task-linked rows through `task_links_college`.
   - Authorization helper must match existing RLS.
3. **CRM pin regression**
   - Pinned visits are merged through a service-role query.
   - That response must be sanitized without removing the visible visit.
4. **Admin import regression**
   - Imported records belong to the importing Admin.
   - Employees should still see assigned task records, but not Admin files.
5. **Legacy latest-file columns**
   - They can expose a hidden file even when `proposal_files` is filtered.
   - Both `/api/college-visits` and `/api/tasks/linked-crm` must shape responses.
6. **Legacy public URLs**
   - UI changes cannot revoke already public URLs.
7. **Activity leaks**
   - File name/path in notes can reveal hidden files unless activity visibility is enforced.
8. **Employee Add College folder dialog**
   - Current default can call an Admin-only route.
9. **Bulk delete/edit semantics**
   - Employee UI exposes some broad controls while API/RLS is narrower.
10. **Schema fallback behavior**
    - Existing code tolerates missing proposal/contact/import columns; new fields need controlled deployment order.
11. **Performance**
    - Creator/uploader resolution must be batched, not one profile query per row.
12. **Admin behavior**
    - Existing Admin response fields and actions must remain available.

---

## 18. Required tests after approval

No dedicated College Visit file-authorization automated tests were found. Add tests for:

1. Admin creates Visit A and uploads AdminFile.pdf.
   - Admin sees visit and file.
   - Authorized Employee sees visit but receives no AdminFile metadata.
2. Employee creates Visit B.
   - Employee sees it.
   - Admin sees it with creator name and Employee badge.
3. Employee uploads EmployeeFile.pdf.
   - Employee and Admin see it.
   - Admin sees uploader identity and role.
4. Employee manually requests Admin file list/signed URL.
   - 403 or 404.
   - No path or signed URL returned.
5. Admin opens Employee-created visit.
   - Full visit and Employee-uploaded files visible.
6. Employee opens Admin-created, task-authorized visit.
   - General visit visible.
   - Admin-only files and activities absent.
7. Employee submits `created_by`, `uploaded_by`, or `visibility_scope`.
   - Server ignores/rejects them and uses session identity.
8. Employee attempts a mismatched `entityId` and file path/file ID.
   - Denied.
9. Employee directly queries `proposal_files`.
   - Admin-only metadata absent under RLS.
10. Student Master proposal upload/list/open/remove.
    - Existing behavior unchanged.
11. Admin import, duplicate preview, folder opening, and manual College creation.
    - Existing behavior unchanged.
12. Follow-ups, timeline, WhatsApp/email outreach, proposal preview, and task-linked College workflow.

Required regression commands/suites after implementation:

- TypeScript
- Production build
- Existing smoke suite
- Phase 6 authorization suite
- New College Visit authorization tests
- Existing Student Master/proposal manual regression

---

## 19. Direct answers requested

### 1. How Admin College Visits currently work

Admin uses the shared `CollegeVisitsWorkbench`, receives all College Visit rows, and has Admin-only import/settings/reports/task-assignment controls. Existing Admin RLS is company-wide.

### 2. Whether Employee College Visits already partially exist

Yes. The Employee navigation entry, page, shared workbench, create/edit/outreach/follow-up/proposal UI, task-linking, and pin support already exist.

### 3. How College Visit files are stored

- Current proposal documents: private `proposals` bucket with object paths stored in `proposal_files` and legacy latest-file columns.
- Old proposal files: public `college-visit-proposals` URLs.
- WhatsApp outreach attachments: public `task-attachments` URLs.
- Imported spreadsheets: binary file is not retained; parsed database rows and metadata are retained.

### 4. Whether files currently track uploader

Multi-file `proposal_files` rows track `uploaded_by` and `uploaded_at`. Legacy single-file columns and legacy URLs do not reliably track uploader.

### 5. Whether visits currently track creator

Yes. `college_visits.created_by` and `created_at` exist and new API/import flows set them from authenticated identity.

### 6. Current file access security

Modern storage is private, but service-role proposal APIs are missing entity/visibility authorization and file metadata RLS is broad. Legacy proposal and outreach buckets are public.

### 7. Exact change needed so Admin files are hidden from Employees

Add server-derived `visibility_scope`; set Admin College uploads to `admin_only`, Employee uploads to `admin_employee`; enforce this in proposal list/sign/upload/remove routes, `proposal_files` RLS, College/task API response shaping, and activity RLS. Migrate legacy public files separately.

### 8. Exact change needed so Admin can see Employee-created visits

No record-visibility RLS change is needed. Admin already receives all visits. Add creator profile resolution, UI display/filter, and regression tests.

### 9. Exact change needed to display Created By / Uploaded By

Reuse `college_visits.created_by` and `proposal_files.uploaded_by`, batch-resolve `profiles.full_name` and `profiles.role`, return additive attribution objects, and render small role badges. Do not duplicate names in the tables.

### 10. Whether DB/RLS/Storage migration is required

- **DB/RLS:** Yes, for durable file visibility and hidden timeline events.
- **Current private `proposals` bucket:** No privacy change required.
- **Legacy `college-visit-proposals`:** Migration required before privacy can be tightened safely.
- **Public outreach attachments:** Separate product/security decision required.

### 11. Exact files that will need modification

Primary required files are listed in Section 13. No Employee navigation or duplicate Employee workbench file is required.

---

## 20. Approval gate

The audit gate was completed before implementation began. The approved application implementation is now prepared, but deployment must remain gated on applying `college_visit_file_visibility_patch.sql` first.

Separate approval is still required before:

- Changing bucket privacy
- Migrating legacy objects
- Redesigning public WhatsApp attachment delivery

Recommended approval scope:

1. Approve the **private modern proposal path first**:
   - visibility column
   - activity visibility
   - scoped RLS
   - secured proposal APIs
   - creator/uploader UI
   - Employee folder-flow correction
   - tests
2. Handle legacy public proposal migration as a second controlled phase.
3. Decide separately whether WhatsApp outreach links are considered externally shared content or restricted internal College Visit files.

