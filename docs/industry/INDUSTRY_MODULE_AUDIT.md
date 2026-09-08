# AJ OS Industry Module — Audit and Design

**Status:** audit/design only  
**Prepared:** 2026-09-07  
**Implementation:** not started  
**Database migration:** not created or executed  
**Approval gate:** the data model, role scope, migration SQL, RLS, storage policies, and rollback must be approved before implementation.

## 0. Executive decisions

1. **Industry must be a new CRM vertical.** `clients` is the Student Lead Master and `college_visits` is educational-institution outreach. Neither has Industry semantics.
2. **Do not merge Industry and College Visit.** The two modules will integrate only through new Industry-owned institution references and mapping rows. Existing College Visit rows, statuses, APIs, RLS, reports, and tasks remain unchanged.
3. **Use normalized Industry contacts.** The College Visit `contacts jsonb` pattern is not suitable because Industry requires searchable contacts, decision-maker/IV-coordinator flags, contact-level status, and durable foreign keys from follow-ups, opportunities, slots, visits, and activities.
4. **Industry follow-ups need their own table.** `lead_followups` has a hard FK to student leads and College Visit stores only summary dates on the parent row.
5. **Confirmed visits are separate from opportunities and slots.** One Industry can have many opportunities, availability slots, institutions, and completed visits.
6. **A small Industry-local institution directory is required.** AJ OS has no normalized college/school master. `college_visits.college_name` and `profiles.college_name` are text. New `iv_institutions` records may optionally reference an existing `college_visits.id` without modifying it.
7. **Private storage only.** Use a new private bucket and short-lived signed URLs after Industry row-level authorization. Do not reuse the legacy public `college-visit-proposals` bucket.
8. **Reports are additive.** Industry reporting uses new queries/RPCs and must not alter current admissions, revenue, attendance, productivity, or College Visit calculations.
9. **Admin and employee scope are implementable today.** Manager is not currently a supported portal role: it is absent from `UserRole`, `profiles_role_check`, `requireStaffApiSession`, and `app/manager`. Manager access therefore requires a separate approved platform decision.
10. **No existing API contract needs to change for the initial module.** New `/api/industry/**` routes are the default. Any later task, reminder, or notification bridge must be an additive extension.

## 1. Existing College Visit structure

### 1.1 Database

`AJ_Academy_SB/college_visits_schema.sql` defines:

- `college_visits`: one educational-institution outreach record with `college_name`, location, primary contact fields, visit/MOU/follow-up status, ownership, notes, source, and timestamps.
- `college_visit_activities`: append-only activity rows keyed to `college_visit_id`.
- Admin-all and employee policies, subsequently tightened by `crm_owner_isolation.sql`.
- Indexes for name, owner, visit status, next follow-up, and recent updates.

Additive patches provide:

- `contacts jsonb` with a primary-contact compatibility projection (`college_visits_contacts_patch.sql`).
- proposal metadata and proposal files.
- import batches, staging rows, duplicate preview, and import provenance (`college_visit_import_batches.sql`).
- task links through `tasks.college_visit_ids` (`tasks_college_link_patch.sql`).
- activity-derived outreach flags and task-assignee overlays.

### 1.2 Application

Primary files:

- `AJ_Academy_OS/components/college-visits/CollegeVisitsWorkbench.tsx`
- `AJ_Academy_OS/components/college-visits/CollegeVisitsSubsections.tsx`
- `AJ_Academy_OS/components/college-visits/CollegeCallOutcomeModal.tsx`
- `AJ_Academy_OS/components/college-visits/collegeVisitsHelpers.ts`
- `AJ_Academy_OS/components/college-visits/collegeVisitsCsv.ts`
- `AJ_Academy_OS/lib/collegeVisitsApi.ts`
- `AJ_Academy_OS/lib/collegeVisitsImport.ts`

Routes:

- `GET|POST /api/college-visits`
- `PATCH|DELETE /api/college-visits/[id]`
- `GET|POST /api/college-visits/[id]/activities`
- `/api/college-visits/import/**`
- `/api/college-visits/lists`
- `/api/college-visits/row-status`

### 1.3 Why it must not become Industry

College Visit is institution-side outreach. Its vocabulary and reports assume college name, Principal/TPO contacts, MOU, college visit status, and College Visit tasks. Adding companies or industrial visits would:

- mix institution and company ownership/RLS;
- contaminate College Visit analytics and imports;
- overload MOU and visit statuses with different meanings;
- make existing employee task/pin behavior ambiguous;
- still fail school and multi-institution requirements.

Industry should reuse its **patterns**, not its rows or API contracts.

## 2. Existing CRM, call, follow-up, and task structure

### 2.1 Student Lead Master

`public.clients` is an individual student/admission lead store, despite the legacy table name. `clients.company_name`, `clients.college_company`, and `clients.industry` are attributes of a student lead, not B2B account records.

Student-only satellites:

- `lead_followups` → `clients.id`
- `lead_activities` → `clients.id`
- `client_documents` → `clients.id`
- `lead_call_sessions` → `clients.id`

These cannot be reused for Industry because their FKs, RLS, call outcomes, admissions, finance, and reporting semantics are student-specific.

### 2.2 Calls and outreach

- Student Lead uses `/api/leads/call/**` and `lead_call_sessions`, with admission-oriented outcomes and live call state.
- College Visit uses `tel:` plus `college_visit_activities` and a College-specific outcome modal.
- `/api/outreach/send-email` is generic transport: `{ provider, to, cc, subject, body, attachments }` → `{ ok, provider, from }`. It validates and sends but does not authorize an Industry record or write an Industry activity.
- WhatsApp remains a deep link; AJ OS can record that the compose/open action occurred but cannot claim delivery or read status without a provider integration.

**Industry recommendation:** create Industry-specific outreach endpoints/wrappers that authorize the Industry/contact, invoke the existing email transport service where safe, and atomically write an Industry activity. Do not call student lead or College Visit routes.

### 2.3 Tasks

Existing tasks support `assignment_type` values for lead, project, and college, with JSON arrays for linked records and a generic `task_activities` log.

Initial Industry delivery should not modify task constraints. Industry ownership and follow-up assignment work without Task Assignment. A later approved integration can add a new `industry` assignment type and Industry IDs through a dedicated patch, with matching RLS helper, cleanup, pin, and tests.

### 2.4 Follow-ups

The Student model is the best structural reference: normalized scheduled follow-ups plus separate activities. The College model is insufficient because it retains only summary fields on the parent.

Industry should keep:

- `industry_followups` as scheduled work and completion state;
- `industry_activities` as what happened;
- denormalized `industries.last_contact_at` and `industries.next_follow_up_at` only as maintained summaries for fast lists.

## 3. Existing shared services that can be reused safely

| Existing asset | Safe Industry use | Conditions |
|---|---|---|
| `profiles` | owner, assignee, coordinator, creator, verifier FKs | No profile policy broadening |
| `employee_details.manager_id` | future team-scope relationship | Only after manager role decision |
| `system_settings` | Industry list/config JSON under a new key | New key only; no College/CRM defaults changed |
| `in_app_notifications` | new Industry notification rows/types | New producer/RPC; existing types untouched |
| `audit_logs` | admin-level mutation/security audit | New `module='industry'`; entity timeline remains separate |
| `components/reports/reportsExport.ts` | CSV/Excel/PDF generation | Industry wrapper and Industry-shaped rows |
| `lib/csv.ts` | CSV encoding/download | Contract unchanged |
| `lib/email/outreachEmail.ts` | email transport | Only behind Industry authorization + activity logging |
| `components/shared/EmailComposeModal.tsx` | local Industry wrapper/optional callbacks | Defaults unchanged |
| `lib/outcomeRemarks.ts` | append-only human remarks formatting | Do not use as the canonical activity store |
| rate-limit/security validators | Industry API hardening | Industry-specific keys and limits |
| Supabase server/admin clients | API data access | Service-role routes must explicitly enforce scope |
| `Sidebar` rendering | display new nav tree supplied by layouts | No shared Sidebar behavior change |
| existing table/badge/input components | local Industry composition | No global CSS/default changes |
| Playwright smoke/Phase 6 helpers | regression and Industry authorization tests | Add tests; do not weaken assertions |

Verified shared UI primitives suitable for Industry-local composition:

- `components/ui/TableSearchBar.tsx`
- `components/ui/TablePagination.tsx`
- `components/ui/ResponsiveDataView.tsx`
- `components/ui/CollapsibleFilterPanel.tsx`
- `components/ui/BulkSelectionBar.tsx`
- `components/ui/CrmFlash.tsx`
- `components/ui/PageHeader.tsx`
- `components/ui/MultiSelectFilter.tsx`
- `components/shared/LeadActivityModal.tsx`
- `components/shared/EmailComposeModal.tsx`
- `components/shared/WhatsAppComposeModal.tsx`

`usePagination` is client-side slicing and therefore is not suitable for the primary Industry Directory. The Directory must keep page/search/filter state in the URL and request a bounded server page. It may be reused only for small already-bounded child lists.

## 4. Shared pieces that should not be modified or reused directly

| Asset | Decision and reason |
|---|---|
| `clients`, `lead_*`, `/api/leads/call/**` | Student/admission semantics and hard FKs |
| `college_visits`, `college_visit_activities`, `/api/college-visits/**` | Institution-side outreach; must remain unchanged |
| College Visit `contacts jsonb` | Not normalized or independently searchable |
| `CollegeVisitsWorkbench` | Large College-specific component; fork patterns into Industry components |
| CRM/College statuses and settings | Industry and IV statuses are distinct |
| `/api/proposals/**` | Entity union is student/college and current service-role authorization is too broad for sensitive Industry documents |
| `college-visit-proposals` bucket | Legacy public bucket |
| `lead_call_sessions` | Hard FK and student outcome workflow |
| current analytics productivity formula | Industry activity impact needs separate approval |
| `aj_reminders` checks | No Industry type/module today; do not silently change them |
| global CSS/shared defaults | Industry should use local styles/components |
| existing task/pin constraints | Cross-module changes deferred to a separately approved integration |

## 5. Existing tables that can be reused

Direct FK/config reuse:

- `profiles`
- `employee_details` (future manager hierarchy only)
- `system_settings`
- `in_app_notifications`
- `audit_logs`

Optional later bridges:

- `tasks` and `task_activities`
- `aj_reminders` by soft reference

No existing business table can safely store the Industry master, contacts, follow-ups, opportunities, slots, confirmed visits, visit documents, visit checklists, logistics, or feedback.

## 6. Exact new entities required

### Core CRM

1. `industries` — one company/facility relationship record.
2. `industry_contacts` — normalized people; many per Industry.
3. `industry_activities` — calls, email, WhatsApp, LinkedIn, meetings, status changes, and system events.
4. `industry_followups` — scheduled/assigned next actions with completion links.
5. `industry_relationship_tags` — controlled tags such as Internship, CSR, MoU, Workshop.
6. `industry_relationship_tag_links` — many-to-many Industry/tag mapping.

### IV planning

7. `iv_institutions` — Industry-module institution reference supporting colleges and schools; optional link to an existing College Visit row.
8. `industry_iv_opportunities` — possible visit, independent of relationship status.
9. `industry_iv_opportunity_institutions` — many-to-many opportunity/institution mapping and requirement details.
10. `industry_iv_opportunity_dates` — preferred and alternative dates without comma-separated values.
11. `industry_iv_slots` — company availability/capacity.
12. `industry_iv_slot_institutions` — reservations/matches between slots and institution requirements where needed.

### Confirmed operations

13. `industrial_visits` — the confirmed/scheduled visit header.
14. `industrial_visit_institutions` — institutions, class/department, expected and actual student/faculty counts per visit.
15. `industry_documents` — document/attachment metadata and private object path for an Industry, follow-up, opportunity, or visit.
16. `industrial_visit_checklist_items` — configurable snapshot of required Industry/Institution/AJ/visit-day checks.
17. `industrial_visit_logistics` — one-to-one IV transport/cost/coordination data.
18. `industrial_visit_feedback` — typed Industry/faculty/student feedback and summaries.

### Import and configuration

19. `industry_import_batches`
20. `industry_import_rows`

`industry_documents` requires `industry_id` and may also reference one contact, follow-up, opportunity, or visit. A check constraint permits at most one sub-entity parent. This provides multiple follow-up attachments and visit documents without a polymorphic, unenforced `entity_id`.

## 7. Proposed Industry master

`industries` should include:

- identity: `id`, human-readable `industry_code`, `company_name`, `legal_name`;
- classification: `category`, `subcategory`, `company_type`, `status`;
- public contact: `website`, normalized `website_domain`, `main_phone`, `main_email`;
- location: address, area, city, district, state, pincode, country, maps URL, optional latitude/longitude;
- facility/profile: employee strength, facility type;
- visit support: student/college/school support flags, maximum students, minimum age;
- preferences: student levels, departments, courses;
- restrictions/facilities: safety restrictions, dress code, PPE, photography, mobiles, food, parking/bus, accessibility;
- relationship: primary owner, optional secondary owner, source, first/last contact, next follow-up, relationship status, priority, notes;
- retention: visit count, last visit date, students/institutions hosted, relationship strength, next relationship follow-up and future-interest flags;
- duplicate/audit: normalized name, duplicate override reason/actor/time;
- timestamps: created/updated and actor IDs.

Multi-valued controlled text such as preferred departments may use PostgreSQL arrays with GIN indexes in V1; mappings to Industries, contacts, opportunities, visits, institutions, and tags must use rows/FKs, never comma-separated IDs.

### Duplicate prevention

Server-side duplicate scoring should compare:

- normalized company/legal name;
- website domain;
- normalized main email;
- normalized main phone;
- address/city.

Return candidates and reasons before insert. Do not auto-merge. “Continue Anyway” must be explicit and audited. A hard unique company-name constraint is not recommended because branches and same-name organizations exist and the required override would become impossible.

## 8. Proposed contacts structure

`industry_contacts`:

- Industry FK;
- name, designation, department;
- mobile, alternate mobile, email, WhatsApp, LinkedIn;
- preferred channel;
- primary-contact, IV-coordinator, decision-maker, influencer flags;
- active/inactive status and notes;
- created/updated actors and timestamps.

Rules:

- only one active primary contact per Industry (partial unique index);
- normalize phone/email for search and duplicate warnings;
- contacts are not deleted when referenced operationally; mark inactive;
- follow-ups, activities, opportunities, slots, and visits use nullable contact FKs with `ON DELETE SET NULL`.

## 9. Proposed IV Opportunity

`industry_iv_opportunities`:

- opportunity code/name, Industry and owner;
- source, institution type, department/course/class/year/semester;
- expected students/faculty;
- duration, visit type, objective, requested areas;
- primary Industry contact;
- pipeline status, probability, lost/closed reason;
- notes and timestamps.

Institution requirements belong in `industry_iv_opportunity_institutions`; dates belong in `industry_iv_opportunity_dates`. This supports one opportunity with multiple institutions or dates without arrays of IDs.

## 10. Proposed IV Slot

`industry_iv_slots`:

- Industry, available date, start/end time;
- capacity, minimum/maximum students;
- eligible institution types, departments, student levels;
- visit duration and available areas;
- Industry contact;
- Available/Tentative/Reserved/Confirmed/Completed/Cancelled/Expired status;
- notes, owner, created/updated actors.

Slots may exist without an institution (Industry-first). A reservation/mapping row links a slot to an opportunity/institution later.

## 11. Proposed confirmed Visit

`industrial_visits`:

- visit code, Industry, originating opportunity/slot;
- visit date and reporting/start/end times;
- Industry/AJ coordinators;
- objective, agenda, status;
- safety and entry requirements;
- visit completion summary and actual times;
- issues and follow-up opportunity;
- created/updated actors.

`industrial_visit_institutions` stores each participating institution, its coordinator, department/class/course/year, expected/actual students and faculty, parent-consent requirement, and attendance/document state.

`industrial_visit_logistics` stores only IV-specific transport, food/accommodation, coordinators, emergency contacts, budget/fees/costs, and timing.

Safety fields are optional/configurable: briefing, PPE, safety shoes, helmet, lab coat/uniform, photography/mobile restrictions, minimum age, medical/accessibility limitations, prohibited items, emergency number, assembly point, bus parking, and entry documentation. None is globally mandatory.

`industrial_visit_checklist_items` snapshots the checklist applicable to that visit. Each row stores category (Industry/Institution/AJ/Visit Day), label, required flag, status, linked document, verifier, verified time, expiry, sort order, and notes. Templates belong under a new `system_settings.industry` key, but changing a template never rewrites an existing visit checklist.

## 12. Status model

### Industry relationship

New, Contacted, Follow-up Required, Interested, Information Requested, Under Discussion, IV Possible, Temporarily Unavailable, Not Interested, Partnership Potential, Active Partner, Dormant, Do Not Contact.

### Opportunity pipeline

Industry Identified → Initial Contact → Contact Established → Requirement Discussed → Industry Interested → Availability Requested → Tentative Date Received → College/School Mapped → Permission Requested → Approval Pending → Approved → Visit Scheduled → Visit Completed → Follow-up/Feedback → Relationship Retained.

Closed: Not Interested, No Availability, Cancelled by Industry, Cancelled by Institution, Postponed, Lost, Duplicate.

### Slot

Available, Tentative, Reserved, Confirmed, Completed, Cancelled, Expired.

### Confirmed visit

Scheduled, Confirmed, Rescheduled, In Progress, Completed, Cancelled, Postponed.

### Follow-up

Pending, Completed, Rescheduled, Cancelled, Missed.

Relationship and opportunity statuses must remain separate. Every transition writes an immutable Industry activity with old/new values.

## 13. College/school mapping logic

AJ OS has no shared institution master and no School module. The safe design is:

- create `iv_institutions` inside Industry;
- support Engineering, Arts & Science, Management, Polytechnic, School, Higher Secondary, and Other;
- optionally set `source_college_visit_id` for a record selected from College Visits;
- never write back to or overwrite that College Visit record;
- retain a name/location/contact snapshot on IV records so historical visits do not change when a source institution is edited;
- use opportunity and visit join tables for many-to-many mappings.

Industry-first:

`Industry → Slot → Opportunity/requirement → Institution match → Confirmed visit`

College-first:

`Institution requirement → Opportunity → deterministic Industry/slot search → approval → Confirmed visit`

Deterministic matching filters category/department relevance, city, capacity, date, institution type, and student level. No AI scoring in V1.

## 14. Follow-up workflow

1. User opens an Industry/contact.
2. User records Call, Email, WhatsApp, LinkedIn, Physical Visit, Online Meeting, Proposal Sent, Permission Requested, Reminder, or Other.
3. API verifies record access and writes `industry_activities`.
4. Unless the relationship/opportunity is in a closed state, the API requires either:
   - a next follow-up date/time/owner, or
   - an explicit “no next action” reason.
5. The API creates/reschedules `industry_followups` and refreshes parent summary fields in one transaction/RPC.
6. Due jobs create deduplicated in-app notifications.
7. Completion links the follow-up to the activity that resolved it.

Dashboard queries are server-side and indexed for Due Today, Overdue, Tomorrow, This Week, No Follow-up, Recently Contacted, High Priority, and Interested.

## 15. Proposed navigation and pages

One connected module rooted at:

- Admin: `/admin/industry`
- Employee: `/employee/industry`

Subsections should be children/tabs:

- Dashboard
- Directory
- Add Industry
- Follow-ups
- IV Opportunities
- IV Slots / Availability
- Scheduled Visits
- Visit Calendar
- Documents
- Completed Visits
- Relationships
- Reports & Analytics

Only additive entries in `app/admin/layout.tsx` and `app/employee/layout.tsx`; no reordering. Student and Mentor layouts remain untouched. Manager navigation is deferred because there is no manager portal.

## 16. API audit and proposed routes

### Existing APIs considered

| Existing route | Current contract/consumer | Industry decision |
|---|---|---|
| `/api/college-visits` | GET `{visits,pinIds}`; POST `{visit}`; College workbench | Do not reuse or change |
| `/api/college-visits/[id]` | College PATCH/DELETE | Do not reuse or change |
| `/api/college-visits/[id]/activities` | College activity GET/POST | Do not reuse or change |
| `/api/college-visits/import/**` | Admin College import workflow | Copy architecture into new routes |
| `/api/leads/call/**` | Student lead sessions/outcomes | Do not reuse |
| `/api/tasks/linked-crm` | lead/college-linked task rows | No initial change; optional later extension |
| `/api/tasks/crm-pins` | lead/college pin contract | No initial change; optional later extension |
| `/api/reminders` | reminder form → `{reminder,created_count}`; max 500 GET | Do not change initially |
| `/api/outreach/send-email` | generic mail transport | Use service internally only; Industry wrapper logs/authorizes |
| `/api/proposals/upload|list|signed-url|remove` | student/college union | Do not extend for Industry documents |
| `/api/analytics/query` | current Reports & Analytics | Do not change calculations |

The proposal signed-URL/upload routes use the service role and do not provide the strict Industry ownership/document authorization required here. Industry must have separate document APIs.

### New API surface

- `GET|POST /api/industry`
- `POST /api/industry/duplicates`
- `GET|PATCH|DELETE /api/industry/[industryId]`
- `GET|POST /api/industry/[industryId]/contacts`
- `PATCH /api/industry/contacts/[contactId]`
- `GET|POST /api/industry/[industryId]/activities`
- `GET|POST /api/industry/followups`
- `PATCH /api/industry/followups/[followupId]`
- `POST /api/industry/followups/[followupId]/complete`
- `GET|POST /api/industry/opportunities`
- `GET|PATCH /api/industry/opportunities/[opportunityId]`
- `GET|POST /api/industry/slots`
- `GET|PATCH /api/industry/slots/[slotId]`
- `GET|POST /api/industry/institutions`
- `POST /api/industry/matches`
- `GET|POST /api/industry/visits`
- `GET|PATCH /api/industry/visits/[visitId]`
- `GET|POST|PATCH /api/industry/visits/[visitId]/checklist`
- `GET|PUT /api/industry/visits/[visitId]/logistics`
- `GET|POST /api/industry/visits/[visitId]/feedback`
- `POST /api/industry/documents/upload`
- `POST /api/industry/documents/signed-url`
- `DELETE /api/industry/documents/[documentId]`
- `POST /api/industry/import/upload`
- `GET|PUT /api/industry/import/[batchId]/mapping`
- `POST /api/industry/import/[batchId]/dry-run`
- `POST /api/industry/import/[batchId]/execute`
- `GET /api/industry/dashboard`
- `GET /api/industry/reports`
- `GET /api/industry/reports/export`
- `POST /api/industry/cron/reminders` protected by `CRON_SECRET`

List APIs use validated server-side filters, cursor or offset pagination, stable ordering, bounded page sizes, and total counts where useful. They never return an unbounded directory/activity history.

### Proposed contract conventions

- Directory: `GET /api/industry?page=&pageSize=&search=&category=&city=&state=&relationshipStatus=&ivSupported=&ownerId=&priority=&followup=` → `{ rows, page, pageSize, total, filters }`.
- Duplicate check: `POST /api/industry/duplicates` with normalized candidate fields → `{ candidates: [{ industry, score, reasons }] }`.
- Create: `POST /api/industry` with master fields, contacts, and optional `{ continueAnyway, duplicateOverrideReason }` → `201 { industry }`, or `409 { error, candidates }` when confirmation is required.
- Detail: `GET /api/industry/[industryId]` → `{ industry, summary, contacts, nextFollowup }`; activity/opportunity/visit tabs load separately.
- Activity: `POST /api/industry/[industryId]/activities` with contact, type, occurred time, outcome, notes, next-action data, and attachment IDs → `{ activity, followup, industrySummary }`.
- Follow-up completion: POST body contains outcome/activity and next action; response returns the completed row plus new pending follow-up. It is one transaction.
- Opportunities, slots, and visits: list routes return bounded `{ rows, page, pageSize, total }`; create returns `201` and detail routes return one authorized aggregate.
- Matching: `POST /api/industry/matches` with institution type, department, city/radius, date range, capacity, and student level → deterministic `{ matches, appliedFilters }`.
- Documents: multipart upload returns metadata only; signed URL returns `{ url, expiresAt, fileName }` after parent authorization.
- Reports: JSON is default; export validates the same filter DTO and returns CSV/XLSX/PDF without changing existing export utilities.

Validation errors use `400`, unauthenticated `401`, unauthorized `403`, missing scoped records `404`, duplicate confirmation `409`, throttling `429`, and unexpected failures `500`. No existing status code or response shape changes.

## 17. RLS and authorization model

### Current role reality

`types/profile.ts` and active profile constraints support super_admin, admin, employee, student, freelancer, and mentor. `requireStaffApiSession` allows only admin, super_admin, and employee. Some legacy SQL mentions manager, but manager is not a deployable portal role and `app/manager` does not exist.

“Business Development” is currently a designation/department value on an `employee` profile, not a distinct authorization role. Industry RLS should therefore enforce ownership for employees; the UI may use designation/department only to decide who is offered as an owner, never as the security boundary.

### V1 scope

- Super Admin/Admin: organization-wide Industry CRUD/report/export.
- Employee/BD: records where the user is primary owner, secondary owner, follow-up assignee, opportunity owner, visit AJ coordinator, or explicitly shared through a future Industry-owned access table.
- Student/Mentor/Freelancer: denied at layout, API, RLS, storage, and export.
- Manager: deferred pending explicit role/portal decision.

### Policy design

Add Industry-prefixed SECURITY DEFINER helpers with fixed `search_path`, `row_security=off`, revoked public execution, and authenticated grants:

- `industry_is_admin()`
- `industry_user_can_access(industry_id)`
- `industry_user_can_access_opportunity(opportunity_id)`
- `industry_user_can_access_visit(visit_id)`

Parent policies call the helper; child policies inherit access through their parent. Inserts force actor/owner IDs from `auth.uid()` or a validated admin assignment. Employee updates cannot silently transfer ownership. Sensitive documents require both DB metadata access and signed-URL authorization.

No `USING (true)`, no broad profile policy, no College/CRM policy edits, and no reliance on UI-only checks.

Manager team scope, if later approved, should be `owner.employee_details.manager_id = auth.uid()`, not company-wide manager read.

## 18. Storage model

Create one private bucket, recommended name `industry-documents`, with explicit MIME/size limits.

Object paths:

`industries/{industryId}/{entityType}/{entityId}/{uuid}-{safeFilename}`

Store object paths, never public or permanent signed URLs. Suggested entity types: followup, opportunity, visit, permission, checklist, feedback, photo, report, import.

Use Industry-specific upload/list/signed-url/delete routes:

1. authenticate;
2. load the metadata parent;
3. enforce Industry/visit access;
4. validate MIME, extension, size, and path ownership;
5. use service role for the storage operation;
6. write/remove metadata and audit event;
7. issue short-lived signed URLs.

Student lists, consent, medical/emergency records, permissions, and contact files remain private. Photos/videos require an approved size/retention policy; external video links may be stored instead of large uploads.

## 19. Notifications, calendar, activity, and reporting

### Notifications

Reuse `in_app_notifications` through new Industry-specific producer logic and new types. Do not change task/attendance/CRM/College notification producers.

Use idempotency keys for due/overdue, tentative date, permission, document, tomorrow/today, and feedback/report reminders.

The existing `lib/push/sendPushNotification.ts` service accepts user, title, message, type, target URL, optional entity metadata, and priority; it can be invoked from Industry server code without changing its contract. Industry URLs must pass the existing internal-target validation. Do not add Industry fields to `/api/push/event` merely for convenience.

Only notification delivery needs Realtime initially, and `in_app_notifications` is already published. Industry master/activity tables do not need Realtime in V1; explicit refresh/invalidation after writes is simpler and avoids new subscription/RLS surface.

### Calendar

Initial Industry calendar reads from Industry follow-ups, opportunity dates, slot dates, visit dates, and document deadlines. It does not modify `aj_reminders`.

A later optional bridge can add new `related_module` values to `aj_reminders` after an explicit backward-compatible constraint migration.

### Activity and audit

- `industry_activities`: operational timeline visible to authorized staff.
- `audit_logs`: security/admin audit of mutations and export/download events.
- Existing College Visit and lead event names/history remain unchanged.

Proposed immutable Industry event names:

- `INDUSTRY_CREATED`, `INDUSTRY_UPDATED`
- `INDUSTRY_CONTACT_ADDED`, `INDUSTRY_CONTACT_UPDATED`
- `INDUSTRY_INTERACTION_LOGGED`
- `INDUSTRY_FOLLOWUP_CREATED`, `INDUSTRY_FOLLOWUP_RESCHEDULED`, `INDUSTRY_FOLLOWUP_COMPLETED`
- `IV_OPPORTUNITY_CREATED`, `IV_OPPORTUNITY_STAGE_CHANGED`
- `IV_SLOT_CREATED`, `IV_SLOT_RESERVED`
- `IV_APPROVED`, `IV_SCHEDULED`, `IV_RESCHEDULED`, `IV_COMPLETED`, `IV_CANCELLED`
- `IV_DOCUMENT_UPLOADED`, `IV_DOCUMENT_VERIFIED`

Human-facing activity type (Call, Email, WhatsApp, etc.) is a separate field; it is not overloaded with system event names.

### Reports

New server-side Industry report queries cover directory, follow-ups, employee activity, pipeline, scheduled/completed visits, conversion stages, city/category, institution, employee conversion, and repeat Industry.

Conversion denominators are:

- Contact → Interest
- Interest → Approval
- Approval → Scheduled
- Scheduled → Completed
- Contact → Completed overall

Industry activity does not affect existing employee productivity until separately proposed and approved.

## 20. Performance design

- indexed normalized name/domain/phone/email and common owner/status/date filters;
- composite/partial indexes for pending follow-ups and upcoming visits;
- GIN only for genuinely queried arrays;
- server-side pagination and aggregation;
- bounded activity history with “load more”;
- batch-fetch contacts/owners/counts, not one request per Industry;
- dashboard/report SQL or RPCs, not React aggregation;
- deterministic ordering with ID tie-breakers;
- import staging and set-based duplicate checks;
- cache only stable settings/option lists.

### Bulk import design

The College Visit import flow is a useful UX/transaction pattern, but its code and tables remain unchanged. Industry gets parallel batch and staging tables:

`upload → map columns → validate → duplicate candidates → per-row resolution → dry run → confirm → set-based import`

Each staging row retains the source row, normalized values, validation errors, duplicate candidate IDs/reasons, selected action (create/skip/continue), result Industry/contact IDs, and execution error. Imports never update a possible duplicate automatically. The source file is stored in the private Industry bucket under the batch ID and is accessible only to admins through an authorized signed-URL route.

### Relationship retention

Successful visits update Industry summary counters transactionally from completed visit rows; the authoritative history remains the visit tables. Relationship tags stay informational and never create sales opportunities automatically. Future IV, workshop, internship, placement, CSR, training, and MoU interest are retained after an opportunity or visit closes.

## 21. Required migrations

No executable migration is included in this audit. After model approval, present exact SQL, affected objects, compatibility analysis, and exact rollback before creating files.

Proposed migration units:

1. `industry_01_core.sql` — industries, contacts, activities, follow-ups, tags, indexes, triggers, RLS/helpers.
2. `industry_02_iv_planning.sql` — institutions, opportunities, opportunity dates/mappings, slots/reservations.
3. `industry_03_visits.sql` — confirmed visits, institution mappings, checklist, logistics, feedback.
4. `industry_04_documents_storage.sql` — `industry_documents`, private bucket, storage policies.
5. `industry_05_import.sql` — import batches/rows and admin policies.
6. `industry_06_notifications.sql` — Industry notification helpers/idempotency.
7. `industry_07_reporting.sql` — report indexes/views/RPCs after `EXPLAIN`.
8. `industry_rollback.sql` — reverse-order rollback for new Industry objects only.
9. Optional later `industry_tasks_bridge.sql` and `industry_reminders_bridge.sql`.

All are additive. New FKs may point to `profiles`, `college_visits` (nullable source only), and other Industry tables. No existing table is dropped, renamed, repurposed, or backfilled.

Rollback must drop Industry policies/functions/triggers/tables in FK-safe reverse order and remove the private bucket only after objects are explicitly handled. It must never drop shared profiles, notifications, audit logs, system settings, College Visit, CRM, or task data.

## 22. Exact files to create

After approval:

- `AJ_Academy_SB/industry_01_core.sql`
- `AJ_Academy_SB/industry_02_iv_planning.sql`
- `AJ_Academy_SB/industry_03_visits.sql`
- `AJ_Academy_SB/industry_04_documents_storage.sql`
- `AJ_Academy_SB/industry_05_import.sql`
- `AJ_Academy_SB/industry_06_notifications.sql`
- `AJ_Academy_SB/industry_07_reporting.sql`
- `AJ_Academy_SB/industry_rollback.sql`
- `AJ_Academy_OS/types/industry.ts`
- `AJ_Academy_OS/lib/industry/**`
- `AJ_Academy_OS/components/industry/**`
- `AJ_Academy_OS/app/api/industry/**`
- `AJ_Academy_OS/app/admin/industry/**`
- `AJ_Academy_OS/app/employee/industry/**`
- `AJ_Academy_OS/e2e/industry/**`
- `AJ_Academy_OS/docs/industry/INDUSTRY_API.md`
- `AJ_Academy_OS/docs/industry/INDUSTRY_SECURITY_TEST_MATRIX.md`

## 23. Exact existing files that may need modification

Only at the applicable approved phase:

- `AJ_Academy_OS/app/admin/layout.tsx` — add one Industry nav tree.
- `AJ_Academy_OS/app/employee/layout.tsx` — add one Industry nav tree.
- `AJ_Academy_SB/DATABASE_SETUP_ORDER.txt` — add approved Industry migration order.
- `SUPABASE_SETUP_GUIDE.md` — setup/env/route documentation.
- Optional `vercel.json` or existing cron configuration — add Industry reminder job without changing existing jobs.
- Optional task/reminder/report files only if their separate bridge is approved.

Do not modify College Visit, Student Master, current Reports & Analytics, Mentor, Student, Attendance, Auth, Forgot Password, or notification producer code during the core Industry phases.

## 24. Regression risks and isolation

| Risk | Isolation |
|---|---|
| Industry rows contaminating CRM/College reports | New tables and routes; no existing query changes |
| contact JSON becoming unsearchable/inconsistent | normalized `industry_contacts` |
| employee seeing all Industries | owner/assignee RLS + API scope + Phase 6 direct-RLS tests |
| service-role API bypass | explicit authorization helper before every query/file/export |
| manager scope accidentally becoming company-wide | manager deferred; later team-only helper |
| sensitive files becoming public | new private bucket + metadata authorization + signed URLs |
| one API call per row | aggregate/list endpoints and batched joins |
| duplicate Industries | server duplicate candidate endpoint + audited override |
| stale follow-up parent summaries | transactional interaction/follow-up function |
| changing existing reminders/tasks | optional bridges postponed |
| schools forced into engineering fields | generic institution type + class/age/consent fields |
| historical records changing with master edits | snapshots on opportunity/visit mapping rows |
| shared UI changes alter other pages | Industry-local components/wrappers |

## 25. Test and regression plan

New tests cover master, contacts, duplicates, ownership, follow-ups, opportunity workflows, slots/matching, visits, documents/checklists, logistics, completion/feedback, reports, and all role boundaries.

After every phase:

```text
npm run lint
npx tsc --noEmit
npm run test:e2e:smoke
npm run test:e2e:phase6
npm run build
```

Also manually verify Admin login, College Visit, Student Master/CRM, Reports, Mentor, Student, Attendance, and Forgot Password.

If an existing test fails, stop and classify it as Industry defect, existing-module regression, test harness issue, or environment issue before continuing.

Existing test references:

- `e2e/smoke/login.smoke.spec.ts`
- `e2e/smoke/admin.smoke.spec.ts`
- `e2e/smoke/mentor.smoke.spec.ts`
- `e2e/smoke/student.smoke.spec.ts`
- `e2e/smoke/authz.mentor.smoke.spec.ts`
- `e2e/smoke/authz.student.smoke.spec.ts`
- `e2e/phase6/admin.authz.spec.ts`
- `e2e/phase6/mentor.authz.spec.ts`
- `e2e/phase6/student.authz.spec.ts`
- `docs/testing/PHASE_5_SMOKE_REPORT.md`
- `docs/testing/PHASE_6_AUTHORIZATION_RLS_REPORT.md`

## 26. Recommended implementation phases

### Phase 0 — approval and SQL review

- approve this model;
- resolve the open decisions below;
- produce exact core SQL/RLS/storage/rollback for review;
- do not run it yet.

### Phase 1 — core Industry Directory

- core schema, contacts, duplicates, ownership, activity timeline;
- admin/employee API and directory/detail/create UI;
- no task/reminder/report integration.

### Phase 2 — follow-ups

- follow-up schema/workflow/dashboard;
- next-action enforcement;
- due/overdue indexes and tests.

### Phase 3 — opportunities, institutions, and slots

- both Industry-first and institution-first workflows;
- deterministic matching.

### Phase 4 — confirmed visits

- visit schedule, mappings, safety, checklist, logistics, completion, feedback.

### Phase 5 — private documents and import

- private bucket/signed URLs;
- configurable document checklist;
- staged bulk import with duplicate preview.

### Phase 6 — dashboard, reports, calendar, notifications

- server-side aggregations and exports;
- Industry-local calendar;
- idempotent notifications.

### Phase 7 — optional integrations

- separately approve task bridge, global reminder bridge, and additive employee timeline source;
- productivity scoring remains out of scope.

### Phase 8 — hardening and release

- Industry test suite;
- Phase 5 smoke and Phase 6 authorization;
- production build;
- change-isolation report for every phase.

## 27. Open decisions requiring approval

Recommended defaults are listed first:

1. **Manager:** defer until the manager role/portal is formally restored; then team-only access via `employee_details.manager_id`.
2. **Institution model:** create Industry-local `iv_institutions` with optional read-only source link to `college_visits`.
3. **Contacts:** normalized `industry_contacts`, not College-style JSON.
4. **Follow-ups:** separate normalized table plus activity log.
5. **Calls:** activity logging first; add session/live-lock table only if operationally required.
6. **Task bridge:** defer until core Industry ownership is stable.
7. **Reminder bridge:** Industry-local follow-up notifications/calendar first.
8. **Documents:** one private `industry-documents` bucket with metadata categories.
9. **Photos/video:** approve file-size, MIME, and retention limits before storage SQL.
10. **Deletion:** soft archive Industry masters with referenced history; hard delete admin-only only where no operational history exists.
11. **Duplicate override:** permit explicit continue with reason and audit; never auto-merge.
12. **Existing College Visit link:** nullable source reference only; no write-back or data migration.

## 28. Audit conclusion

AJ OS has reusable security, ownership, import, activity, notification, export, and private-storage **patterns**, but no existing table has the correct semantics for this module. The safest architecture is an isolated `industries` CRM with normalized contacts/follow-ups, a separate opportunity/slot layer, an Industry-local generic institution reference, and separate confirmed-visit operations.

No implementation or migration should begin until the model and open decisions are approved. The next deliverable after approval is the exact Phase 1 SQL + RLS + storage-independent rollback for review, not application code.

## 29. Audit change-isolation report

**FILES CREATED**

- `docs/industry/INDUSTRY_MODULE_AUDIT.md`

**FILES MODIFIED**

- None

**EXISTING MODULES TOUCHED**

- None; all existing code and SQL were read only.

**BACKWARDS COMPATIBLE:** YES  
**EXISTING API CONTRACT CHANGED:** NO  
**DATABASE MIGRATION:** NO  
**RLS CHANGE:** NO  
**REGRESSION TEST:** NOT APPLICABLE — no executable code, configuration, schema, or existing documentation was modified.
