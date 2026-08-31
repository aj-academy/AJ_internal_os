# AJ OS — Reports & Analytics

Enterprise employee performance reporting built on existing CRM, attendance, tasks, and call-session data.

## Routes

| Role | Path | Scope |
|------|------|--------|
| Admin / Super Admin | `/admin/reports` | Company-wide (sidebar: **Reports & Analytics**) |
| Employee | `/employee/reports` | Own data only |

Legacy `ReportsWorkbench` remains in the codebase under `components/reports/` for reference; the live admin page now uses `AnalyticsWorkbench`.

## Sections

1. Dashboard Overview — KPIs, charts, accountability alerts  
2. Daily Employee Report — per-employee scorecard (Tasks Done = finished in the selected IST dates, with task titles)  
3. Team Performance — team rollups + top/least performers  
4. Call Activity — Student Master `lead_call_sessions` **plus** College Visits dialer `Phone Call` rows from `college_visit_activities`  
5. Follow-up Report — `lead_followups` + client follow-up dates  
6. Task Completion — work **finished in the selected IST dates** from `task_activities` (`task_completed`) plus the completion note; open/overdue listed separately (not “due today”)  
7. Lead Conversion — by `clients.source`  
8. Admission Report — by course  
9. Revenue Report — by employee (`final_fee` / payment status)  
10. Employee Timeline — team activity feed by default; pick an employee for one person’s log (attendance, calls, CRM, college, tasks, EOD)  
11. Productivity Report — weighted score (calls, CRM, tasks, follow-ups, admissions, attendance) — see **Productivity formula** below  
12. End Of Day Tracker — `work_summaries`  
13. Download Centre — CSV / Excel / PDF / print  

## Report selection

The report is chosen from the **Report Type** dropdown inside the filter panel (the old horizontal pill row is gone). The selection is stored in the URL, so reports are linkable and browser back/forward works:

```text
/admin/reports?report=dashboard
/admin/reports?report=daily-employee
/employee/reports?report=productivity
```

Slugs are defined by `ANALYTICS_SECTION_SLUGS` in `lib/analytics/types.ts`; raw section ids (`daily`, `eod`, …) are also accepted so older links keep working. An unknown or missing value falls back to Dashboard Overview.

## Global filters

**Report Type · Start Date · End Date · Employee · Department · Role · Search** — nothing else.

- **Start / End Date** are real date pickers, both defaulting to today in **Asia/Kolkata**. Presets (Today / Yesterday / This Week / This Month / Custom) were removed. Ranges self-correct if start and end cross over.
- There is **no Apply / Refresh button**. Selecting a report, date, employee, department or role reloads immediately; **Search is debounced 400 ms**. A superseded request is aborted so a slow earlier response cannot overwrite a newer one. A subtle "Updating report…" indicator appears in the filter panel rather than blanking the table.
- Course, Lead source, Lead status, Task status and Admission status were **removed from the global bar**. The API still accepts all of them, and the three that reports genuinely need now appear as a secondary filter inside their own report only:

| Report | Secondary filter |
|---|---|
| Lead Conversion | Lead status |
| Admission Report | Admission status |
| Task Completion | Task status |

Only the active report's secondary filter is sent, so a selection left behind in another report cannot silently narrow the current one.

## KPI cards

Dashboard Overview shows **8** cards: Present (of total staff) · Total Calls (with connected count and rate) · Pending Follow-ups · Tasks Completed · Tasks Overdue · Admissions · Revenue · Avg Productivity.

Removed as redundant or misleading: *Working Now* and *Checked Out* (decompositions of Present, and "Working Now" is a live value that means nothing inside a historical range), *Leads Assigned* (a snapshot that ignored the date filter), and *Connected Calls* (folded into Total Calls). *Pending Revenue* moved to the Revenue report and *Tasks Pending* to Task Completion, which already had it. Task Completion also gained Completion %.

## Partial data warning

Report sources are **paged** (1,000 rows per request) until exhausted rather than capped by a fixed `.limit()`, which previously made totals silently wrong once a table outgrew the cap. If a source reaches the 30,000-row ceiling, the response carries `partial: { tables: [...] }` and the UI shows an amber banner naming the sources, so an understated total is never presented as exact.

## APIs

| Method | Path | Who |
|--------|------|-----|
| `POST` | `/api/analytics/query` | Admin: all; Employee: forced self-scope |
| `POST` | `/api/analytics/eod` | Employee upsert EOD |
| `PATCH` | `/api/analytics/eod` | Admin review / approve |

Body for query: `{ section, from, to, employeeIds, departments, roles, leadStatuses, taskStatuses, admissionStatuses, courses, leadSources, search, page, pageSize }` (legacy singular fields still accepted).

`from` / `to` are authoritative. `preset` is still accepted for older callers, but when a range is supplied without a preset the range is used as-is — it is no longer overridden by a default of "today".

### Authorization

Both report routes use `createAdminClient()`, so RLS does not apply and scope is enforced in TypeScript. Two rules follow from that:

- **Admin / Super Admin** get company scope. **Employee** is forced to `forceEmployeeId = session.id`; the employee id is never read from the request body. Every other staff role (mentor, freelancer, student) is denied with `403` rather than being widened to company scope, and the denial is logged as `analytics_query_role_denied`.
- A self-scoped viewer no longer receives the staff roster. `filterOptions.employees`, `departments` and `roles` are narrowed to the viewer's own profile, so the employee report cannot be used to enumerate colleagues.

`/api/analytics/query` is rate limited to 120 requests/minute per IP and `/api/reports/data` to 60, since both read broadly and are the cheapest path to bulk extraction. Generating the Download Centre pack logs `analytics_export_pack` with the actor and date range.

## Error, empty and denied states

| State | Behaviour |
|-------|-----------|
| Loading | Filter bar shows a spinner; KPI cards show skeletons. Existing data stays on screen instead of blanking. |
| Empty | Per-table empty state; KPI cards show zeroes, not dashes. |
| Partial | Amber banner naming the truncated sources (see above). |
| Denied (`401` / `403`) | Report content is replaced by an "Access denied" panel with a role-specific message. |
| Throttled (`429`) | Explains the request rate rather than surfacing a raw error. |
| Error | Red banner with the server message; the previous result is retained. |

## Database

Run in Supabase (after attendance + CRM + call workflow + tasks):

```text
AJ_Academy_SB/analytics_reporting_schema.sql
```

Adds:

- `work_summaries.support_required`, `additional_remarks`, `reviewed_by`, `reviewed_at`
- Unique `(employee_id, summary_date)` on work summaries  
- Performance indexes on calls, activities, follow-ups, clients, tasks, attendance  
- Optional RPC `analytics_employee_day_rollups(date, date, uuid)`

## Productivity bands

- **Red** &lt; 60%  
- **Yellow** 60–79%  
- **Green** ≥ 80%  

## CRM save discipline (employees)

Employee Student Master saves require:

- Lead status  
- Remarks (`notes`)  
- Next follow-up date  

## Testing checklist

1. Admin opens Reports & Analytics → Overview loads with 8 live KPI cards and no pill row. Tasks Completed is work finished in the selected dates, not due-date matches.  
2. Report Type dropdown switches report and updates `?report=`; reloading the page keeps the report; back/forward moves between reports.  
3. Changing Start / End Date, Employee, Department or Role reloads with no Apply button. Typing in Search fires one request after ~400 ms, not one per keystroke.  
4. Lead Conversion / Admission / Task Completion each show their own secondary status filter; the others show none.  
5. Filter one employee → Daily / Timeline update. Daily **Completed work** shows task titles; check-in times are IST.  
6. Call Activity shows Student Master call sessions and College Visits Phone Call logs (IST day bounds).
7. Task Completion shows completion notes and IST completed-at. Student assignees are named, not Unknown.  
8. Employee Timeline with All employees shows a team feed; picking one person still works.  
9. Employee My Reports only shows self, the Report Type list hides Team Performance, and the Employee / Department / Role filters offer only the viewer — no colleague names.  
9a. Click a productivity score → breakdown lists all six components as earned/max and the total matches the score.  
9b. Sign in as a mentor and POST to `/api/analytics/query` → `403`, and the UI shows "Access denied", not a red error banner.  
10. Export CSV / Excel / PDF from Download Centre. Filenames use the report label and a single date for single-day ranges, e.g. `AJ_OS_Daily_Employee_Report_2026-08-31.xlsx`.  
11. Checkout EOD requires achievement, pending, tomorrow plan.  
12. Employee lead edit blocked without status / remarks / follow-up.  
13. Run SQL script; EOD columns + unique upsert succeed.  

## Productivity formula

Unchanged. The current weights (calls 25, CRM 15, tasks 20, follow-ups 15, admissions 15, attendance 10) are sales-shaped and role-blind, so non-sales roles cannot earn 40 of the 100 points. A role-aware replacement is proposed in `docs/reports/REPORTS_ANALYTICS_REDESIGN_AUDIT.md` §13 and **requires approval before implementation** — do not change the weights silently.

The weights now live in `PRODUCTIVITY_PART_MAX` in `lib/analytics/productivity.ts` and are the single source for both the score and the breakdown shown in the UI, so the two cannot drift apart.

### Score breakdown

Clicking a productivity score in Daily Employee Report or Productivity opens a breakdown showing each component as earned/maximum (for example `Tasks 16/20`, `Attendance 10/10`) with the total. The panel states that the weights favour sales activity, so a low score for a non-sales role is visibly a formula limitation rather than a judgement about the person. The values come from `productivityParts`, which the API already returned.

## Performance notes

- Aggregation is server-side (`createAdminClient` + role gates).  
- Sources are paged to exhaustion (see **Partial data warning**), with a ceiling that is reported rather than hidden. Id lookups are chunked at 400 per request so a large `.in()` cannot exceed the request URL length.
- Date-scoped queries; indexes in `analytics_reporting_schema.sql`.  
- Pagination on call lists (`page` / `pageSize`).  
- Employee Timeline keeps small per-source caps (200–500) because it is a display feed, not an aggregate.
- Per-employee rollups are still aggregated in TypeScript; the existing `analytics_employee_day_rollups` RPC is the intended replacement.
- No dummy data — empty states when tables have no matching rows.

## Timezone

All report boundaries are **Asia/Kolkata**. `isoStartOfDay` / `isoEndOfDay` convert IST calendar days to UTC for `timestamptz` filters, and `eachDateKey` / `isWeekendKeyIst` walk IST days anchored at IST midday so a UTC host (Vercel) cannot shift a day boundary.
