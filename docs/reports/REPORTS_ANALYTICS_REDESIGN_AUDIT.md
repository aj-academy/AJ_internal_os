# Reports & Analytics — Redesign Audit

**Status:** Audit only. No code changed.
**Date:** 2026-08-31
**Scope:** `/admin/reports`, `/employee/reports` and their data layer.

---

## 0. Headline findings (read this first)

1. **There are two Reports implementations in the repo.** The live one is `components/analytics/*`. The one named `components/reports/ReportsWorkbench.tsx` is legacy, is not mounted by either reports page, but its API route `/api/reports/data` is still live and admin-reachable. All redesign work belongs in `components/analytics/*`.
2. **The Apply / Refresh button is already redundant.** The workbench re-fetches on every filter change today, including **every keystroke in Search**. Removing the button is safe; adding debounce is a real performance fix, not cosmetic.
3. **The productivity formula is sales-shaped and role-blind.** Non-sales roles (mentor, accounts, ops) can never earn 40 of the 100 points, so they are structurally capped near 60 and permanently render as "red". This needs approval before changing — see §5 and §13.
4. **Dashboard Overview has 14 KPI cards**, several of which ignore the selected date range and are therefore misleading. Target is 6–8.
5. **IST handling is already correct** in the query layer (`isoStartOfDay` / `isoEndOfDay` / `toDateKeyIst`). Two edge-case bugs are noted in §11.
6. **All reporting runs on the service-role client**, so RLS provides no protection for reports. Scope is enforced by exactly one line of JavaScript. Any new view/RPC inherits this risk — see §12.

---

## 1. Current UI structure

File: `AJ_Academy_OS/components/analytics/AnalyticsWorkbench.tsx` (~910 lines, single client component)

```
<section>
  Header: "Reports & Analytics" + subtitle + scope line
  Export buttons:            [CSV] [Excel] [PDF] [Print]
  Report pills (13 buttons)  ← PART 1 removes this row
  <AnalyticsFiltersBar />    ← date presets + 9 filters + Apply/Refresh
  Error banner
  {section === "overview"  ? ...}   ← 13 sibling conditional blocks
  {section === "daily"     ? ...}
  ... one block per section
</section>
```

Supporting files:

| File | Role |
|---|---|
| `components/analytics/AnalyticsFiltersBar.tsx` | Presets, 9 filters, Apply/Refresh button |
| `lib/analytics/types.ts` | Section ids/labels/order, `AnalyticsFilters`, `EMPTY_ANALYTICS_FILTERS` |
| `lib/analytics/dateRanges.ts` | IST helpers, `resolveDateRange` |
| `lib/analytics/productivity.ts` | `computeProductivityScore` |
| `lib/analytics/runAnalyticsQuery.ts` | ~1,600 lines; all queries + aggregation in TypeScript |
| `app/api/analytics/query/route.ts` | Auth gate + scope forcing |
| `app/api/analytics/eod/route.ts` | EOD upsert / admin review |
| `components/reports/reportsExport.ts` | CSV / Excel / PDF writers (shared with legacy) |
| `components/reports/reportsHelpers.ts` | `formatInr` |

Pages: `app/admin/reports/page.tsx` → `<AnalyticsWorkbench mode="admin" />`; `app/employee/reports/page.tsx` → `mode="employee"`.

Section state is **local React state** (`useState<AnalyticsSectionId>("overview")`) — there is **no URL/query-param sync**, so a report cannot be linked or bookmarked, and a refresh resets to Overview.

Only one report renders at a time already (conditional blocks), so PART 1 is a presentation change, not an architecture change.

---

## 2. Current report list (13)

From `lib/analytics/types.ts` — ids are already stable and reusable as query-param values:

| # | Section id | Label |
|---|---|---|
| 1 | `overview` | Dashboard Overview |
| 2 | `daily` | Daily Employee Report |
| 3 | `team` | Team Performance |
| 4 | `calls` | Call Activity |
| 5 | `followups` | Follow-up Report |
| 6 | `tasks` | Task Completion |
| 7 | `conversion` | Lead Conversion |
| 8 | `admissions` | Admission Report |
| 9 | `revenue` | Revenue Report |
| 10 | `timeline` | Employee Timeline |
| 11 | `productivity` | Productivity Report |
| 12 | `eod` | End Of Day Tracker |
| 13 | `download` | Download Centre |

Employee mode filter (`AnalyticsWorkbench.tsx`) is buggy:

```ts
ANALYTICS_SECTION_ORDER.filter((id) => {
  if (!isEmployee) return true;
  return !["team", "download"].includes(id) || id === "download";
})
```

The `|| id === "download"` clause re-admits `download`, so employees hide only **Team Performance**. Intent was probably to hide both. Flagging rather than fixing — confirm desired behaviour.

---

## 3. Current global filters

`AnalyticsFilters` (`lib/analytics/types.ts`) with 9 filter fields + date + pagination:

| Filter | Widget | Options source | Keep? |
|---|---|---|---|
| Date presets | 5 pills | `resolveDateRange` | **Replace** with Start/End (PART 4) |
| From / To | date inputs, only shown when preset = `custom` | — | **Always show** |
| Employee | MultiSelect, searchable | `profiles` (≤2000, staff roles) | Keep |
| Department | MultiSelect | distinct `profiles.department` | Keep |
| Role | MultiSelect | distinct `profiles.role` | Keep |
| Course | MultiSelect, searchable | `system_settings.crm.interestedPrograms` | **Remove from global** |
| Lead source | MultiSelect | `system_settings.crm.leadSources` | **Remove from global** |
| Lead status | MultiSelect | `system_settings.crm.leadStatuses` | **Remove from global** |
| Task status | MultiSelect | hardcoded 3 values | **Remove from global** → Task Completion only |
| Admission status | MultiSelect | `ADMISSION_STATUSES` const | **Remove from global** → Admission Report only |
| Search | text input | — | Keep, **add debounce** |
| Apply / Refresh | button | — | **Remove** |

Filter panel currently renders up to **11 controls** in a `sm:2 / lg:4 / xl:6` grid → 2–6 rows depending on viewport. This is the height problem in PART 6.

### Removal safety (PART 3) — verified against the query layer

The five filters to be removed are consumed at these exact locations in `lib/analytics/runAnalyticsQuery.ts`:

| Filter | Used by section(s) | Lines |
|---|---|---|
| `courses` | overview/daily/team/productivity, calls, conversion, admissions/revenue | 363–365, 829–831, 1173–1175, 1237–1239 |
| `leadSources` | overview cluster, conversion | 358, 1172 |
| `leadStatuses` | overview cluster | 359 |
| `admissionStatuses` | overview cluster, admissions/revenue | 360–362, 1234–1236 |
| `taskStatuses` | tasks | 1128 |

**Conclusion: removal is UI-only and safe.** Every one of these is read via `asFilterList(...)`, which yields `[]` when absent, and each filter is applied as an `if (filters.x.length)` guard. Dropping them from the UI means they simply stop narrowing results. **No API contract change, no DB change, no data loss.**

Two consequences to accept explicitly:

- Overview / Daily / Team / Productivity KPIs will **no longer be silently narrowed** by Course / Lead source / Lead status / Admission status. Numbers may rise for anyone who had been using those filters. This is more correct — a company-level KPI should not be quietly course-filtered.
- `filterOptions` in the API response still returns `courses`, `leadSources`, `leadStatuses`, `admissionStatuses`. **Keep returning them** — the report-specific secondary filters in Lead Conversion / Admission / Task Completion need them.

---

## 4. Current data sources per report

All via service-role client in `runAnalyticsQuery.ts`. Row caps shown because they are a correctness risk (§11).

| Report | Tables / views | Caps |
|---|---|---|
| Overview, Daily, Team, Productivity | `attendance_records` (5000), `lead_call_sessions` (8000), `college_visit_activities` where `activity_type='Phone Call'` (8000), `tasks` (5000), `lead_activities` (8000), `college_visit_activities` (8000), `lead_followups` (5000), `clients` (8000), `task_activities` where `activity_type='task_completed'` (4000) | yes |
| Call Activity | `lead_call_sessions` (5000) + `college_visit_activities` Phone Call (5000), enriched from `clients` / `college_visits` | yes |
| Follow-up | `lead_followups` (3000) + `clients` (3000) | yes |
| Task Completion | `task_activities` (3000), `tasks` (2000 / 1000) | yes |
| Lead Conversion | `clients` (8000) | yes |
| Admission / Revenue | `clients` (8000) | yes |
| Employee Timeline | `attendance_records`, `lead_call_sessions` (500), `lead_activities` (500), `college_visit_activities` (500), `task_activities` (300), `lead_followups` (300), `work_summaries` | yes |
| EOD Tracker | `work_summaries` + `profiles` | — |
| Download Centre | re-runs daily + calls + tasks + eod | inherits |

Filter options: `profiles` (≤2000) + `system_settings` key `crm`.

Existing SQL assets (not currently used by `runAnalyticsQuery`):

- `AJ_Academy_SB/reports_analytics_schema.sql` → views `v_report_call_sessions`, `v_report_followups` (derived `followup_bucket`), `v_report_lead_activities`, `v_report_admissions` (derived `admission_bucket`); RPC `reports_schema_status()`.
- `AJ_Academy_SB/analytics_reporting_schema.sql` → extends `work_summaries`; RPC `analytics_employee_day_rollups(p_from, p_to, p_employee_id)` returning `calls_attempted`, `calls_connected`, `tasks_completed`, `tasks_pending`, `crm_updates`, `followups_pending`, `admissions`, `revenue`, `present_days`, `working_minutes`.
- `AJ_Academy_SB/lms_calendar_reports.sql` → RPC `lms_report_summary()`.

**Note:** `analytics_employee_day_rollups` already computes in SQL almost exactly what the TypeScript per-employee loop recomputes in Node. This is the single biggest performance win available (§11) and requires no new database objects.

The four `v_report_*` views are consumed only by the **legacy** `/api/reports/data` route.

---

## 5. Existing productivity formula

File: `AJ_Academy_OS/lib/analytics/productivity.ts`. Inputs assembled in `runAnalyticsQuery.ts` lines 471–482.

```
callRate    = callsConnected / callsAttempted        (1 if attempted=0 and connected>0, else 0)
callVolume  = min(1, callsAttempted / 20)
calls       = (callRate*0.6 + callVolume*0.4) * 25   → 25 pts
crm         = min(1, crmUpdates / 15) * 15           → 15 pts
taskRate    = tasksCompleted / tasksAssigned         (1 if assigned=0 and completed>0, else 0)
tasks       = taskRate * 20                          → 20 pts
fuRate      = followupsCompleted / followupsDue      (1 if due=0 and completed>0, else 0)
followups   = fuRate * 15                            → 15 pts
admissions  = min(1, admissions / 3) * 15            → 15 pts
attendance  = min(1, presentDays / expectedWorkDays) * 10  → 10 pts

score = round(clamp(sum, 0, 100))
band  = score < 60 ? red : score < 80 ? yellow : green
```

Input definitions:

- `callsAttempted` = `lead_call_sessions` rows for the employee (college-visit calls **excluded** from this input)
- `callsConnected` = `isConnectedOutcome(call_outcome)` — matches `connected*`, `admission confirmed`, `ready to join`
- `crmUpdates` = `lead_activities` where `created_by = employee`
- `tasksAssigned` = `tasks.assigned_to` count, **falling back to** `tasksCompleted` when zero
- `tasksCompleted` = `task_activities` where `activity_type='task_completed'`
- `followupsDue` = **all** `lead_followups` for the employee in range (not only those actually due)
- `admissions` = assigned clients where `isAdmissionLead()` and created/updated in range
- `presentDays` = `attendance_records.status ∈ {present, completed, late}`
- `expectedWorkDays` = Mon–Fri count in range, floor 1

### Problems

1. **Role-blind (most serious).** Calls (25) + Admissions (15) = **40 points only sales roles can earn**. A mentor, accounts or ops employee with perfect tasks, follow-ups and attendance tops out around 60 → permanently "red". The band thresholds then mislabel good non-sales performers as underperformers, and `accountability` flags them via `lowProductivity: score < 60`.
2. **Hardcoded magic constants.** "20 calls", "15 CRM updates", "3 admissions" are per-period constants that do not scale with the selected range. Over a 30-day range, 20 calls total scores full call volume — so **a longer date range inflates scores**. Not configurable, not per-role.
3. **Zero-denominator inversions.** `tasksAssigned = 0` and `tasksCompleted = 0` → 0/20 points: an employee is penalised because nobody assigned them work. Conversely `assigned=0, completed>0` → full 20.
4. **`followupsDue` is really "follow-ups touched".** It counts every follow-up row in range regardless of due date, so creating follow-ups lowers the ratio. This penalises the exact discipline it intends to reward.
5. **Attendance ignores holidays and approved leave.** `holidays` (`hr_payroll_03_holidays.sql`) and `leave_applications` (`hr_payroll_04_leave_management.sql`) exist but are not consulted, so approved leave and public holidays count as absence.
6. **No reporting-discipline component.** `work_summaries` (EOD) is fully available and already surfaced in its own report, but contributes 0 to the score.
7. **College-visit calls excluded.** Anyone doing college outreach gets no call credit, though the data exists in `college_visit_activities`.
8. **Breakdown computed but not surfaced.** `computeProductivityScore` already returns `parts` and it already flows to the client as `productivityParts` — PART 14's transparency drill-down needs **UI only**, no new computation.

**Per SAFETY GATES this formula is not being changed in this pass.** A proposal is in §13; it requires approval.

---

## 6. Existing KPI cards

### Dashboard Overview — 14 cards

| # | Card | Verdict |
|---|---|---|
| 1 | Total Employees | Keep |
| 2 | Present | Keep |
| 3 | Working Now | **Remove** — live "checked in, not yet out"; meaningless for a historical range |
| 4 | Checked Out | **Remove** — decomposition of Present |
| 5 | Leads Assigned | **Remove** — snapshot; own subtitle admits "not only today", so it ignores the date filter |
| 6 | Total Calls | Keep |
| 7 | Connected Calls | **Merge** into Total Calls as a subtitle/ratio |
| 8 | Pending Follow-ups | Keep |
| 9 | Admissions | Keep |
| 10 | Revenue | Keep |
| 11 | Pending Revenue | **Move** to Revenue Report |
| 12 | Tasks Completed | Keep |
| 13 | Tasks Pending | **Move** to Task Completion (already has its own Pending card) |
| 14 | Avg Productivity | Keep |

Proposed 8: Total Employees · Present · Total Calls (with connected ratio) · Pending Follow-ups · Tasks Completed · Tasks Overdue · Admissions · Revenue · Avg Productivity → trim to 8 by folding Admissions+Revenue or dropping Total Employees.

### Other sections

- **Team Performance** — 8 cards (Employees, Calls, Connected, Admissions, Revenue, Pending Follow-ups, Pending Tasks, Avg Productivity). Acceptable; `Connected` should fold into `Calls`.
- **Task Completion** — 4 cards (Total, Completed, Pending, Overdue). Good. Add Completion %.
- **Follow-up** — cards generated dynamically from a bucket map (`Object.entries`), so count and labels are unpredictable. Should be pinned to the known `followup_bucket` values.
- **EOD** — 2 cards. Fine.
- **Calls / Conversion / Admissions / Revenue / Timeline / Daily / Productivity** — no KPI cards; PART 16 wants a small relevant set for Calls and Revenue.

---

## 7. Redundant / unwanted cards — summary

Remove from Overview: **Working Now**, **Checked Out**, **Leads Assigned**, **Connected Calls** (merge), **Pending Revenue** (move), **Tasks Pending** (move). 14 → 8.

Root cause worth fixing regardless: cards 3 and 5 are **snapshot** metrics inside a **date-ranged** report. That inconsistency is what makes the dashboard feel untrustworthy.

---

## 8. Activity data currently recorded

Confirmed sources (table → key columns):

| Activity | Source | Timestamp | Actor |
|---|---|---|---|
| Attendance in/out, duration | `attendance_records` | `check_in_time`, `check_out_time`, `attendance_date` | `employee_id` |
| Attendance corrections | `attendance_corrections` | `reviewed_at` | `requested_by`, `reviewed_by` |
| Tasks (state now) | `tasks` | `created_at`, `updated_at`, `due_date` | `assigned_to`, `assigned_by` |
| Task events | `task_activities` | `created_at` | `actor_id` |
| Calls (CRM) | `lead_call_sessions` | `started_at`, `ended_at` | `employee_id` |
| Calls (college) | `college_visit_activities` type `Phone Call` | `created_at` | `created_by` |
| Follow-ups | `lead_followups` | `follow_up_date`, `completed_at` | `assigned_employee_id`, `created_by` |
| CRM activity | `lead_activities` | `created_at` | `created_by` |
| College visit activity | `college_visit_activities` | `created_at` | `created_by` |
| Leads / conversion | `clients` | `created_at`, `updated_at`, `converted_at`, `last_contacted_at` | `assigned_to` |
| Revenue / expense / payments | `finance_transactions`, `expense_claims`, `project_payments`, `finance_activities` | `transaction_date`, `approved_at`, `payment_date` | `employee_id`, `created_by` |
| Notifications | `in_app_notifications` | `created_at`, `read_at` | `user_id` |
| Tickets / queries | `lms_student_tickets` (+ `lms_ticket_messages`) | `created_at`, `first_response_at`, `resolution_at` | `assigned_to` |
| Assignments | `lms_assignments`, `_recipients`, `_submissions`, `_evaluations` | `assigned_at`, `submitted_at`, `evaluated_at` | `assigned_by`, `evaluator_id` |
| Tests | `lms_tests`, `_recipients`, `_attempts`, `_answers` | `start_at`, `submitted_at` | `assigned_by` |
| Study materials | `lms_study_materials`, `_recipients`, `lms_material_activity` | `published_at`, `first_opened_at`, `created_at` | `assigned_by`, `student_id` |
| Counselling / mentoring | `counselling_sessions`, `mentor_allocations` | `session_at`, `assigned_at` | `mentor_id` |
| Projects (academic) | `lms_projects`, `_milestones`, `_submissions` | `submitted_at`, `due_date` | `guide_mentor_id` |
| Projects (ops) | `projects`, `project_activities` | `created_at` | `created_by` |
| **EOD updates** | **`work_summaries`** | `summary_date`, `reviewed_at` | `employee_id`, `reviewed_by` |
| Payroll audit | `audit_logs` | `created_at` | `actor_id` |
| Reminders | `aj_reminder_activity_logs` | `created_at` | `actor_id` |
| Mood check-in | `employee_daily_mood_checkins` | `mood_date` | `employee_id` |

Only **9 of these ~24 sources** are currently read by the reports layer (§4). Considerable reporting value is already in the database, unused: tickets with real SLA timestamps and CSAT, LMS evaluations, material engagement, counselling sessions, finance activities, notification read-rates.

---

## 9. Activities NOT currently recorded (gaps)

| # | Activity | Existing source | Missing event | Proposed minimal logging | Storage impact |
|---|---|---|---|---|---|
| 1 | **Login / logout** | none — `lib/security/auditLog.ts` only `console.info`; `app/api/auth/sign-in/route.ts` calls `logSecurityEvent` | no persistence at all; no `last_login` column | either persist `logSecurityEvent` into existing `audit_logs` (`module='auth'`), or read Supabase's internal `auth.audit_log_entries` | ~2 rows/user/day; small |
| 2 | **Messages sent (WhatsApp / email)** | `lead_activities` / `college_visit_activities` rows with `activity_type` `'WhatsApp Message'` / `'Email'`; body embedded in `notes` free text | no structured channel, recipient, template, or delivery/read status. WhatsApp is a `wa.me` deep link so delivery is **unknowable** | add `channel` + `metadata` to the existing activity insert rather than a new table; count by `activity_type` for reporting now | none (reuses rows) |
| 3 | **Task completion time** | `tasks` has no `completed_at` | completion timestamp only inferable from `task_activities` | keep deriving from `task_activities`; optionally add nullable `tasks.completed_at` backfilled from activities | 1 column |
| 4 | **Task started** | `tasks.status = 'In Progress'` | no transition timestamp | log `task_started` into `task_activities` at the existing status-change site | small |
| 5 | **Admission event** | `clients.converted_at`, `admission_status` | no event row, so "admissions in range" relies on `updated_at`, which any edit disturbs | write a `lead_activities` row on admission-status change | small |
| 6 | **Student fee → revenue** | `clients.final_fee`; `finance_transactions` | fees never posted to the finance ledger; two disconnected ledgers (already flagged by `reports_schema_status`) | product decision, not a logging fix — document as known divergence | — |
| 7 | **Calls received** | `lead_call_sessions` is outbound-initiated | no inbound direction flag | add `direction` column if inbound is ever captured; **do not fabricate** | 1 column |
| 8 | **Real call duration** | `approximate_duration_seconds` | no carrier duration (already documented) | none without telephony integration | — |

Recommendation: only #1 (login) and #4/#5 (cheap `*_activities` writes) are worth instrumenting, and only after the UI work lands. Everything else in PART 7 is already derivable.

---

## 10. Existing exports

`components/reports/reportsExport.ts`: `exportRowsAsCsv`, `exportRowsAsExcel`, `exportMultiSheetExcel`, `exportRowsAsPdf`, `formatCallActivityExportRows`. Print uses `window.print()`.

`exportCurrent(fmt)` in `AnalyticsWorkbench.tsx` picks rows per section from the already-fetched `data`, so exports **already respect** Report Type + date range + all active filters (they export what was queried).

Current filenames:

```
AJ_OS_{section}_{from}_to_{to}.csv|.xlsx|.pdf
AJ_OS_Analytics_{from}_to_{to}.xlsx        (Download Centre pack)
```

Gaps vs PART 18:

- Uses the raw section **id** (`daily`), not the label (`Daily_Employee_Report`).
- Single-day ranges still render `2026-08-31_to_2026-08-31`.
- Overview exports fall through to `rows = employees`, i.e. the employee scorecard — reasonable but undocumented.
- Excel prepends a meta row; CSV and the multi-sheet pack do not.
- `window.print()` prints the whole page including nav chrome; no print stylesheet.

---

## 11. Query / performance risks

1. **Every metric is aggregated in Node.** `runAnalyticsQuery.ts` is ~1,600 lines pulling up to ~8,000 rows per table, then looping per employee in JavaScript (`perEmployee` loop, lines ~455–552). Directly contradicts PART 22.
2. **Hard row caps silently truncate.** Caps of 3000–8000 have no "partial data" signal. Once a table exceeds its cap the report is **wrong, not just slow** — exactly the class of bug just fixed in College Visits, where a 2000-row cap made the All Colleges folder read 284 instead of 463. **This is the highest-priority correctness risk in the module.**
3. **Search re-queries the server on every keystroke.** `load` is a `useCallback` over `[filters, isEmployee, section]` and `useEffect(() => void load(), [load])`, so each character mutates `filters` and refires the full query. No debounce, no abort — responses can also land out of order.
4. **No AbortController.** Rapid filter changes race; a slow earlier response can overwrite a newer one.
5. **`analytics_employee_day_rollups` is unused.** SQL that already computes the per-employee rollup is sitting in the database while Node recomputes it.
6. **No pagination server-side for most sections.** `page`/`pageSize` exist on `AnalyticsFilters` but tables are paginated client-side after fetching everything.
7. **Download Centre re-runs four report builds** in one request.
8. **`eachDateKey` timezone inconsistency.** It emits keys via `toDateKey` (process timezone) while `from`/`to` are IST keys. On a UTC host this can shift `expectedWorkDays` and per-day buckets by a day at boundaries. `resolveDateRange`, `isoStartOfDay`, `isoEndOfDay`, `toDateKeyIst` are all correct — only `eachDateKey` is not.
9. **`expectedWorkDays` ignores `holidays` and `leave_applications`** (see §5.5).
10. **`filterOptions` fetches ≤2000 profiles on every query**, including for employees who cannot use those filters.
11. **No indexes verified** for the report access patterns (`attendance_records(employee_id, attendance_date)`, `lead_call_sessions(employee_id, started_at)`, `task_activities(actor_id, activity_type, created_at)`, `lead_activities(created_by, created_at)`, `lead_followups(assigned_employee_id, follow_up_date)`). Needs `EXPLAIN` before adding anything.

---

## 12. RLS / security considerations

- **`/api/analytics/query`** — tries `requireAdminApiSession()` → company scope; else `requireStaffApiSession()` plus an explicit `role !== "employee"` 403, then `runAnalyticsQuery(createAdminClient(), { forceEmployeeId: profile.id })`.
- **All reporting uses `createAdminClient()` (service role), so RLS is fully bypassed.** The only thing separating an employee from company-wide data is `runAnalyticsQuery.ts` line 121:

```ts
const employeeIds = body.forceEmployeeId ? [body.forceEmployeeId] : asFilterList(body.employeeIds ?? body.employeeId);
```

- **Roster leak:** even in self scope, `filterOptions` returns up to 2000 profiles (name, role, department) to the employee.
- **No mentor / manager tier.** Helpers collapse to admin-or-self; `mentor` and `manager` cannot reach reports at all. `manager` is used in RLS policies but is absent from the `profiles.role` check constraint.
- **Legacy `/api/reports/data`** is admin-gated but unscoped beyond query params, interpolates the `course` param into a PostgREST `.or(...)` without validation, and has no rate limiting or audit logging.
- **`v_report_*` views were created without `security_invoker = true`.** On PG15+ they run with owner privileges. They are currently only reachable through the service-role legacy route, but **any new report view must set `security_invoker = true`** or it becomes a full-table read for every authenticated user, silently undoing `crm_owner_isolation.sql` and `tasks_employee_rls_fix.sql`.
- **`profiles_employee_crm_select`** (`employee_student_master_rls.sql`) grants every employee read access to all profiles under RLS. Phase 6B.1 deliberately left it in place.
- Neither reports route calls `enforceRateLimit` or `logSecurityEvent`, so bulk extraction is unthrottled and unaudited.

**Conclusion:** PART 26 is satisfiable without touching RLS, because reports do not depend on RLS today. The requirement is to keep scope enforcement explicit and server-side, and to add `security_invoker = true` to any new view.

---

## 13. Proposed productivity formula (APPROVAL REQUIRED — not implemented)

Per SAFETY GATES, presented for approval only.

**Old formula:** §5. **Problems:** §5.1–5.8.

**Proposal — role-aware, normalised, using only existing data.**

Two changes of principle:

1. **Normalise targets per working day**, not per range, so a longer date range no longer inflates scores. `target = perDayTarget × expectedWorkDays`.
2. **Redistribute weights per role family**, keeping the total at 100, so nobody is scored on a metric their job cannot produce.

| Component | Data (all exists) | Sales / BD | Mentor | Ops | Accounts | Admin |
|---|---|---|---|---|---|---|
| Task completion | `task_activities` + `tasks` | 20 | 25 | 40 | 30 | 30 |
| Attendance discipline | `attendance_records` − `holidays` − approved `leave_applications` | 15 | 15 | 15 | 15 | 15 |
| Follow-up discipline | `lead_followups` due vs completed | 20 | — | — | — | 10 |
| Activity execution | `lead_call_sessions` + `college_visit_activities` Phone Call + `lead_activities` | 20 | — | — | — | 10 |
| Outcome contribution | `clients` admissions, `finance_transactions` | 20 | — | — | 25 | 20 |
| Academic delivery | `lms_assignment_evaluations`, `lms_test_attempts`, `counselling_sessions` | — | 40 | — | — | — |
| Query / SLA resolution | `lms_student_tickets` first-response & resolution | — | 15 | 30 | 15 | 10 |
| Finance throughput | `expense_claims`, `project_payments`, `finance_activities` | — | — | — | 10 | — |
| EOD / reporting discipline | `work_summaries` | 5 | 5 | 15 | 5 | 5 |
| **Total** | | **100** | **100** | **100** | **100** | **100** |

Additional fixes bundled with it:

- `followupsDue` counts only follow-ups whose `follow_up_date` falls in range (true "due"), not every touched row.
- No-work-assigned case becomes **excluded** (component dropped and weights re-normalised) rather than scored 0.
- Include college-visit calls in activity execution.
- Subtract holidays and approved leave from `expectedWorkDays`.
- Per-day targets and weights move into `system_settings` (key `productivity`) so they are tunable without a deploy.

**Worked example — Sales employee, 1–31 Aug 2026 (21 working days):**

```
Tasks         26/30 completed        → 0.867 × 20 = 17.3
Attendance    20/21 present          → 0.952 × 15 = 14.3
Follow-ups    17/20 due completed    → 0.850 × 20 = 17.0
Activity      210 calls vs 20/day=420→ 0.500 × 20 = 10.0
Outcome       5 admissions vs 6      → 0.833 × 20 = 16.7
EOD           21/21 submitted        → 1.000 ×  5 =  5.0
                                        Total     = 80.3 → 80 (green)
```

Same employee under the **current** formula scores differently mainly because call volume saturates at 20 calls for the whole month. **This is a material change, so it is not being implemented until approved.**

**Missing data that limits the proposal:** no login events (so no "time discipline" beyond attendance); no real call duration; no inbound calls; student fees absent from `finance_transactions` (so Sales "revenue" stays admissions-based); `counselling_sessions` has no actual start/end, only scheduled `session_at`.

---

## 14. Database changes required

**For PARTS 1–6 (the UI redesign): none.** No migration, no new table, no new view, no API contract change. This is the whole of the requested UI work.

Optional, later, each requiring separate approval:

| # | Change | Purpose | Risk |
|---|---|---|---|
| 1 | Use existing `analytics_employee_day_rollups` RPC | move per-employee aggregation into SQL | none — object already exists |
| 2 | Add indexes after `EXPLAIN` (§11.11) | date/employee filtering | low, additive |
| 3 | `tasks.completed_at` nullable, backfilled from `task_activities` | accurate completion timing | low, additive |
| 4 | Persist `logSecurityEvent` into `audit_logs` with `module='auth'` | login/logout reporting | low; uses existing table |
| 5 | New `v_report_*` views for unused domains (tickets, LMS) | SQL-side aggregation | **must set `security_invoker = true`** |
| 6 | `system_settings` key `productivity` | tunable weights/targets | low; existing table |

Explicitly **not** recommended: a `user_activity_feed` materialized view. Per-domain `*_activities` tables plus the existing rollup RPC already cover the requirement, and a unified feed would duplicate operational data, need a refresh strategy, and add a second source of truth. Revisit only if cross-domain timeline queries prove too slow after §11.1–11.5 are addressed.

---

## 15. Exact files to modify (UI redesign)

| File | Change |
|---|---|
| `lib/analytics/types.ts` | Drop `preset` and the 5 removed filters from `AnalyticsFilters`/`EMPTY_ANALYTICS_FILTERS`; add optional per-report secondary filter fields. Keep section ids as URL values. |
| `lib/analytics/dateRanges.ts` | Keep IST helpers; `resolveDateRange` becomes optional; **fix `eachDateKey` to use `toDateKeyIst`**. |
| `components/analytics/AnalyticsFiltersBar.tsx` | Rewrite: add Report Type select; Start/End date always visible; keep Employee/Department/Role/Search; remove presets, the 5 filters and Apply/Refresh; 2-row responsive grid. |
| `components/analytics/AnalyticsWorkbench.tsx` | Remove pill row; pass `section`/`onSectionChange` to the filter bar; sync `?report=` via `useSearchParams`/`router.replace`; debounce search 400 ms; add `AbortController`; trim Overview to 8 cards; move Pending Revenue → Revenue and Tasks Pending → Task Completion; add per-report secondary filters; productivity breakdown drill-down from existing `productivityParts`; improve export filenames. |
| `lib/analytics/runAnalyticsQuery.ts` | **No contract change needed.** Optional: accept per-report secondary filters; later swap the per-employee loop for the rollup RPC. |
| `app/api/analytics/query/route.ts` | No change for the UI work. Later: stop returning the full roster in self scope; add rate limiting. |
| `app/admin/reports/page.tsx`, `app/employee/reports/page.tsx` | Wrap in `<Suspense>` if `useSearchParams` is adopted. |
| `components/reports/reportsExport.ts` | No change; only callers change. |
| `AJ_Academy_OS/docs/REPORTS_ANALYTICS.md` + `SUPABASE_SETUP_GUIDE.md` | Document the new filter model per the repo docs rule. |

Files deliberately **not** touched: `components/reports/ReportsWorkbench.tsx`, `components/reports/ReportsCrmPanels.tsx`, `reportsConfig.ts`, `reportsExportRows.ts`, `reportsExportMeta.ts`, `lib/reports/*`, `app/api/reports/data/route.ts` (legacy path — see §16).

---

## 16. Recommended implementation sequence

**Phase 1 — UI redesign (no DB, no API change, reversible)**
1. `?report=` query-param sync + section state.
2. Pills → Report Type dropdown inside the filter panel.
3. Start/End date always visible; default both to today (IST); remove presets.
4. Remove the 5 global filters (UI only); keep `filterOptions` intact.
5. Remove Apply/Refresh; debounce Search 400 ms; add `AbortController`; subtle "Updating report…" indicator that does not blank the table.
6. Trim Overview 14 → 8 cards; relocate Pending Revenue and Tasks Pending.
7. Regression-check all 13 reports render and export.

**Phase 2 — correctness (highest value)**
8. Replace hard row caps with either server-side pagination or an explicit "partial data" warning (§11.2).
9. Fix `eachDateKey` IST bug.
10. Add report-specific secondary filters (Lead Status / Admission Status / Task Status).
11. Export filename and metadata polish.

**Phase 3 — performance**
12. `EXPLAIN` the main report queries; add indexes.
13. Adopt `analytics_employee_day_rollups` for Daily/Team/Productivity.
14. Stop shipping the roster to employee scope; add rate limiting to both report routes.

**Phase 4 — productivity (gated on §13 approval)**
15. Approve weights and per-day targets.
16. Move them into `system_settings`.
17. Implement role-aware scoring with holiday/leave-aware attendance.
18. Add the transparency drill-down (data already present).

**Phase 5 — coverage & cleanup**
19. Extend Timeline and Daily with unused sources (tickets, LMS, counselling, finance).
20. Decide the fate of legacy `/api/reports/data` + `ReportsWorkbench.tsx` — remove or keep; today it is dead UI with a live unscoped endpoint.
21. Add login persistence and cheap `task_started` / admission activity rows if still wanted.
22. Phase 5/6 regression suite, then production build.
