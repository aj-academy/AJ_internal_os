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
11. Productivity Report — weighted score (calls, CRM, tasks, follow-ups, admissions, attendance)  
12. End Of Day Tracker — `work_summaries`  
13. Download Centre — CSV / Excel / PDF / print  

## Global filters

Today · Yesterday · This Week · This Month · Custom range, plus Employee, Department, Role, Course, Lead Source, Lead Status, Task Status, Admission Status, Search.

## APIs

| Method | Path | Who |
|--------|------|-----|
| `POST` | `/api/analytics/query` | Admin: all; Employee: forced self-scope |
| `POST` | `/api/analytics/eod` | Employee upsert EOD |
| `PATCH` | `/api/analytics/eod` | Admin review / approve |

Body for query: `{ section, preset, from, to, employeeId, department, role, course, leadSource, leadStatus, taskStatus, admissionStatus, search, page, pageSize }`.

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

1. Admin opens Reports & Analytics → Overview loads with live KPIs. Tasks Completed is work finished in the selected dates, not due-date matches.  
2. Filter one employee → Daily / Timeline update. Daily **Completed work** shows task titles; check-in times are IST.  
3. Call Activity shows Student Master call sessions and College Visits Phone Call logs (IST day bounds).
4. Task Completion shows completion notes and IST completed-at. Student assignees are named, not Unknown.  
5. Employee Timeline with All employees shows a team feed; picking one person still works.  
6. Employee My Reports only shows self.  
7. Export CSV / Excel / PDF from Download Centre.  
8. Checkout EOD requires achievement, pending, tomorrow plan.  
9. Employee lead edit blocked without status / remarks / follow-up.  
10. Run SQL script; EOD columns + unique upsert succeed.  

## Performance notes

- Aggregation is server-side (`createAdminClient` + role gates).  
- Date-scoped queries with limits; indexes in `analytics_reporting_schema.sql`.  
- Pagination on call lists (`page` / `pageSize`).  
- No dummy data — empty states when tables have no matching rows.
