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
2. Daily Employee Report — per-employee scorecard  
3. Team Performance — team rollups + top/least performers  
4. Call Activity — `lead_call_sessions` detail  
5. Follow-up Report — `lead_followups` + client follow-up dates  
6. Task Completion — `tasks`  
7. Lead Conversion — by `clients.source`  
8. Admission Report — by course  
9. Revenue Report — by employee (`final_fee` / payment status)  
10. Employee Timeline — attendance, calls, CRM activities, tasks, EOD  
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

1. Admin opens Reports & Analytics → Overview loads with live KPIs.  
2. Filter one employee → Daily / Timeline update.  
3. Call Activity shows sessions from `lead_call_sessions`.  
4. Employee My Reports only shows self.  
5. Export CSV / Excel / PDF from Download Centre.  
6. Checkout EOD requires achievement, pending, tomorrow plan.  
7. Employee lead edit blocked without status / remarks / follow-up.  
8. Run SQL script; EOD columns + unique upsert succeed.  

## Performance notes

- Aggregation is server-side (`createAdminClient` + role gates).  
- Date-scoped queries with limits; indexes in `analytics_reporting_schema.sql`.  
- Pagination on call lists (`page` / `pageSize`).  
- No dummy data — empty states when tables have no matching rows.
