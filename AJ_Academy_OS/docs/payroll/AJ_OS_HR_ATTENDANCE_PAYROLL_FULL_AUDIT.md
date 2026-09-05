# AJ OS — HR / Attendance / Payroll Full Audit
**Date:** September 2026  
**Type:** Read-only analysis. No code or data was modified.

---

## 1. Existing HR Sections

| Section | Route | Component |
|---|---|---|
| Employee Master (Admin) | `/admin/employee-master` | `app/admin/employee-master/page.tsx` |
| Employee Profile Details | via `AdminEmployeeProfileView` | `components/admin/AdminEmployeeProfileView.tsx` |
| Salary Structure | `/admin/hr-payroll/salary-structures` | `SalaryStructureWorkbench.tsx` |
| Salary Adjustments | `/admin/hr-payroll/salary-adjustments` | `SalaryAdjustmentsWorkbench.tsx` |
| Salary Queries | `/admin/hr-payroll/salary-queries` | `SalaryQueriesWorkbench.tsx` |
| Payroll Settings | `/admin/hr-payroll/payroll-settings` | `PayrollSettingsWorkbench.tsx` |
| Monthly Payroll | `/admin/hr-payroll/monthly-payroll` | `PayrollCalculateWorkbench.tsx` |
| Payslips (Admin) | `/admin/hr-payroll/payslips` | `PayslipsWorkbench.tsx` |
| Payroll Reports | `/admin/hr-payroll/reports` | `PayrollReportsWorkbench.tsx` |
| Attendance Policies | `/admin/hr-payroll/attendance-policies` | `AttendancePolicyWorkbench.tsx` |
| Attendance Review | `/admin/hr-payroll/attendance-review` | `AttendanceReviewWorkbench.tsx` |
| Leave Management | `/admin/hr-payroll/leave-management` | `LeaveManagementWorkbench.tsx` |
| Holiday Calendar | `/admin/hr-payroll/holidays` | `HolidayCalendarWorkbench.tsx` |
| My Salary Structure (Employee) | `/employee/hr-payroll/salary` | `MySalaryStructureWorkbench.tsx` |
| My Payslips (Employee) | `/employee/hr-payroll/payslips` | `MyPayslipsWorkbench.tsx` |
| My Salary Queries (Employee) | `/employee/hr-payroll/queries` | `MySalaryQueriesWorkbench.tsx` |
| My Leave (Employee) | `/employee/hr-payroll/leave` | `MyLeaveWorkbench.tsx` |

**Employee data fields tracked:**
- `profiles`: id, full_name, email, department, designation, role, status
- `employee_details`: profile_id, joined_at, employment_type
- `employee_profile_details`: bank_name, account_number, ifsc_code, pan_number, uan_number, esi_number, account_holder_name

---

## 2. Existing Attendance Sections

| Section | Route | Component |
|---|---|---|
| Admin Attendance Overview | `/admin/attendance?tab=overview` | `app/admin/attendance/page.tsx` |
| Check-in/Check-out Logs | `/admin/attendance?tab=logs` | `AdminAttendanceLogsTable.tsx` |
| Permission Requests | `/admin/attendance?tab=permission` | `AdminPermissionRequestsTable.tsx` |
| Work Summary (EOD) | `/admin/attendance?tab=summary` | inline in page.tsx |
| Monthly Report | `/admin/attendance?tab=monthly` | inline in page.tsx |
| Employee Attendance | `/employee/attendance` | `MemberAttendancePage.tsx` |
| Freelancer Attendance | `/freelancer/attendance` | `FreelancerAttendancePage.tsx` |
| Attendance Review Queue | `/admin/hr-payroll/attendance-review` | `AttendanceReviewWorkbench.tsx` |

**Key attendance tables:**
- `attendance_records`: id, employee_id, attendance_date, check_in_time, check_out_time, total_working_minutes, status, location_type, check_in_selfie_url
- `attendance_policies`: effective-dated policy rows
- `holidays`: holiday_date, is_paid
- `leave_applications`: employee_id, start_date, end_date, is_half_day, status, leave_type_id
- `leave_types`: is_paid, counts_as_presence
- `work_summaries`: employee_id, attendance_id, summary_date, completed_work, pending_work, challenges, tomorrow_plan, status, manager_remarks
- `permission_requests`: employee_id, permission_date, from_time, to_time, status
- `employee_daily_mood_checkins`: employee_id, mood, mood_date

**Timezone:** All business-hour calculations use `Asia/Kolkata` via `Intl.DateTimeFormat` — confirmed in `attendanceStatus.ts`.

---

## 3. Existing Salary/Payroll Sections

| Section | File |
|---|---|
| Payroll Engine (core) | `lib/hr/payrollEngine.ts` |
| Salary Structure | `lib/hr/salaryStructure.ts` |
| Attendance Status Derivation | `lib/hr/attendanceStatus.ts` |
| Attendance Policy | `lib/hr/attendancePolicy.ts` |
| Payroll Settings | `lib/hr/payrollSettings.ts` |
| Payroll Workflow | `lib/hr/payrollWorkflow.ts` |
| Salary Adjustments | `lib/hr/salaryAdjustments.ts` |
| Payslip Service | `lib/hr/payslipService.ts` |
| Payslip PDF | `lib/hr/payslipPdf.ts` |
| Payslip Format | `lib/hr/payslipFormat.ts` |
| Payroll Automation | `lib/hr/payrollAutomation.ts` |
| Payroll Notifications | `lib/hr/payrollNotifications.ts` |
| Audit Log | `lib/hr/auditLog.ts` |

---

## 4. Database Tables Participating in Payroll

| Table | Purpose |
|---|---|
| `profiles` | Employee identity, role, status |
| `employee_details` | joined_at, employment_type |
| `employee_profile_details` | Bank, PAN, UAN, ESI |
| `employee_salary_structures` | Effective-dated salary components |
| `attendance_records` | Daily check-in/check-out |
| `attendance_policies` | Effective-dated attendance rules |
| `holidays` | Holiday calendar |
| `leave_applications` | Approved leaves |
| `leave_types` | is_paid, counts_as_presence |
| `payroll_periods` | One row per year/month, tracks status |
| `payroll_items` | One row per employee per period (calculated result) |
| `payroll_settings` | Effective-dated payroll configuration |
| `salary_adjustments` | One-time additions/deductions |
| `payslips` | Generated PDF metadata + storage path |
| `payroll_automation_jobs` | Idempotent background job queue |
| `work_summaries` | EOD checkout summaries |

---

## 5. APIs Participating in Payroll

| Route | Method | Purpose |
|---|---|---|
| `/api/hr/payroll/calculate` | GET | Load period + items |
| `/api/hr/payroll/calculate` | POST | Run calculation |
| `/api/hr/payroll/workflow` | POST | Status transitions |
| `/api/hr/payroll/reports` | GET | 14 report types |
| `/api/hr/payroll/settings` | GET/POST | Payroll settings CRUD |
| `/api/hr/payroll/adjustments` | GET/POST/PATCH | Salary adjustments |
| `/api/hr/payroll/automation` | POST | Run automation jobs |
| `/api/hr/salary/structures` | GET/POST | Salary structure CRUD |
| `/api/hr/salary/queries` | GET/POST | Employee salary queries |
| `/api/hr/payslips` | GET/POST | Payslip list, generate, release, download |
| `/api/hr/attendance/policies` | GET/POST | Attendance policy CRUD |
| `/api/hr/attendance/review` | GET/POST | Attendance review queue |
| `/api/hr/leave/applications` | GET/POST/PATCH | Leave management |
| `/api/hr/leave/types` | GET/POST | Leave type config |
| `/api/hr/holidays` | GET/POST | Holiday calendar |

---

## 6. Exact Current Salary Formula

### Salary Types Supported
`monthly` | `daily` | `hourly` | `intern_stipend` | `consultant` | `commission`

### Divisor (configurable via `salary_day_method`)
| Method | Divisor |
|---|---|
| `fixed_30` (default) | 30 |
| `calendar_days` | Actual calendar days in month |
| `working_days` | Working days (excl. weekly offs + holidays) |
| `configured_days` | Admin-configured fixed number |

### For Monthly/Stipend/Consultant/Commission salary type:

```
Earned Basic     = (basic_salary × payable_days) / divisor
Earned HRA       = (hra × payable_days) / divisor
Earned Allowances = (special + travel + communication + other_allowances) × payable_days / divisor
Earned Incentive = (incentive × payable_days) / divisor

Loss of Pay (LOP) = (monthly_gross × (unpaid_leave_days + absent_days)) / divisor

Gross Earnings = Earned Basic + Earned HRA + Earned Allowances + Earned Incentive
               + Adj Bonus + Adj Overtime + Adj Reimbursements + Adj Arrears + Adj Other Earnings

Total Deductions = LOP + Fixed Deductions + Adj Advance Recovery + Adj Loan Recovery
                 + Adj Penalty + Statutory Deductions + Adj Other Deductions

Net Salary = Gross Earnings − Total Deductions  (floored at 0)
```

### For Daily salary type:
```
Earned = daily_rate × payable_days
```

### For Hourly salary type:
```
Hours = (present_days + half_days) × (min_full_day_minutes / 60)
Earned = hourly_rate × hours
```

---

## 7. How Working Days Are Calculated

For each calendar day in the period:
- If weekly off AND no attendance record → `weeklyOffs += 1`
- If holiday AND no attendance record → `holidays += 1`
- If neither weekly off nor holiday → `workingDays += 1`

---

## 8. How Paid Days (Payable Days) Are Calculated

```
payableDays = presentDays + paidLeaveDays + holidayPayable + weeklyOffs
```
Where:
- `holidayPayable` = `holidays` count if `holidayTreatment === "paid_holiday"`, else 0
- `weeklyOffs` are included (monthly salaried staff are paid for weekly offs under fixed_30/calendar methods)
- Capped at `calendarDays` to prevent overpay

---

## 9. How LOP Is Calculated

```
LOP = (monthly_gross × (unpaid_leave_days + absent_days)) / divisor
```
- `unpaid_leave_days`: approved leave with `is_paid = false`
- `absent_days`: no attendance record, not holiday, not weekly off, no approved leave
- Missing checkout days (`missingAttendanceDays`) do NOT automatically become LOP — they go to review queue

---

## 10. How Attendance Affects Salary

Path:
```
attendance_records (check_in/check_out)
  → deriveAttendanceForDay() [attendanceStatus.ts]
    → considers: holidays, weekly offs, approved leaves, WFH, policy rules
    → produces: present / half_day / absent / paid_leave / unpaid_leave / missing_checkout / etc.
  → buildAttendanceTotalsForEmployee() [payrollEngine.ts]
    → aggregates all days into AttendanceTotals
  → calculateEmployeePayroll()
    → uses payableDays and unpaidAndAbsent to pro-rate salary
```

Payroll reads **live attendance** from `attendance_records` at calculation time. Results are then **snapshotted** into `payroll_items.input_snapshot` (JSONB).

---

## 11. Mid-Month Joiners

**NOT explicitly handled** in the current engine. The engine processes all calendar days from `period_start` to `period_end`. If an employee joined mid-month, they will have no attendance records before their joining date, which will count as absent days unless manually handled. This is a **known gap**.

---

## 12. Leavers (Exit During Month)

Same as mid-month joiners — **NOT explicitly handled**. Days after exit will count as absent. No `exit_date` field is read by the payroll engine currently.

---

## 13. Paid Leaves

Yes, handled. `leave_applications` with `leave_types.is_paid = true` → `paidLeaveDays` → included in `payableDays` → no salary deduction.

---

## 14. Unpaid Leaves

Yes, handled. `leave_applications` with `leave_types.is_paid = false` → `unpaidLeaveDays` → included in `unpaidAndAbsent` → LOP deduction applied.

---

## 15. Bonuses / Incentives

Handled via `salary_adjustments` table:
- `performance_incentive`, `sales_incentive` → `incentives`
- `bonus` → `bonus`
- `overtime` → `overtimeAmount`
- `arrears` → `arrears`
- `travel_reimbursement`, `food_reimbursement`, `other_reimbursement` → `reimbursements`
- `other_addition` → `otherEarnings`

Only **approved** adjustments are included in payroll calculation.

---

## 16. Deductions

| Deduction | Source |
|---|---|
| Loss of Pay | Calculated from unpaid leave + absent days |
| Fixed Deductions | `employee_salary_structures.fixed_deductions` |
| Advance Recovery | `salary_adjustments` type `salary_advance` |
| Loan Recovery | `salary_adjustments` type `loan_recovery` |
| Penalty | `salary_adjustments` type `penalty` or `attendance_deduction` |
| Statutory (PF/ESI/TDS) | Configured but **disabled by default** — requires `statutory_enabled=true` AND `statutory_label="verified"` AND configured rates. Currently produces an error if enabled without rates. |
| Other Deductions | `salary_adjustments` type `other_deduction` or `asset_recovery` |

---

## 17. Net Salary Calculation

```
Net = Gross Earnings − Total Deductions
Net is floored at 0 (never negative)
```
If net would be negative, an error is logged in `calculation_errors` and status becomes `"error"`.

---

## 18. Payslip Generation

1. Payroll must be `approved`, `locked`, or `paid`
2. `generatePayslipsForPeriod()` in `payslipService.ts` reads `payroll_items`
3. Builds PDF via `payslipPdf.ts` (uses `buildPayslipPdfBuffer`)
4. Uploads to Supabase Storage bucket `payslips` at path `{employee_id}/{YYYY-MM}/{payslip_number}.pdf`
5. Inserts/updates row in `payslips` table
6. Employee accesses via short-lived signed URL (120 seconds)
7. Payslip includes: company info, employee info, attendance breakdown, earnings, deductions, gross, net, payment status

---

## 19. Historical Payroll Storage

**Stored, not recalculated.** `payroll_items` stores the full result including:
- `input_snapshot` (JSONB): complete attendance, structure, policy, settings at time of calculation
- `component_breakdown` (JSONB): all component values
- `calculation_version`: integer version counter

Once a period is `locked` or `paid`, it **cannot be recalculated** without a Super Admin reopen with reason. This is correctly implemented.

**Risk identified:** If a period is in `draft`, `calculated`, or `pending_review` status, editing attendance WILL change the next recalculation result. There is no warning shown to the user about this.

---

## 20. Payroll Lock / Finalization

**Fully implemented.** Workflow states:
```
draft → attendance_review → pending_adjustments → calculated → pending_review
  → approved → locked → paid
```
- `locked` and `paid` are terminal — cannot recalculate
- `reopened` requires Super Admin + reason
- `cancelled` is terminal unless reopened

---

## 21. Calculations That Appear Correct

- Pro-rata formula is mathematically sound
- LOP = gross × absent/divisor is standard Indian payroll practice
- Payable days capped at calendar days (prevents overpay)
- Paid leave correctly excluded from LOP
- Weekly offs included in payable days for monthly staff (correct for fixed_30)
- Adjustment system correctly separates pending vs approved
- Salary structure versioning with effective dates is correct
- Payslip PDF uses stored `payroll_items` data (not live recalculation)
- IST timezone used for all attendance time comparisons

---

## 22. Calculation Risks

| Risk | Severity | Details |
|---|---|---|
| Mid-month joiner not handled | High | No `joining_date` check in engine — days before joining count as absent |
| Exit date not handled | High | No `exit_date` check — days after exit count as absent |
| Missing checkout treatment | Medium | Default is `send_to_review` — blocks payroll if `require_attendance_review_clearance=true` |
| Statutory deductions disabled | Medium | PF/ESI/TDS not calculated — `statutory_enabled=false` by default |
| Attendance edit after calculation | Medium | No warning shown when attendance is edited for a non-locked period |
| Half-day counting | Low | `halfDays` accumulates as 0.5 increments — verify display rounding |
| Freelancer without structure | Low | Correctly skipped, but no notification to admin |

---

## 23. UX Problems

1. **Month selector uses raw number (1–12)** — not "September 2026" format
2. **No payroll period status banner** — user must read small text to know current status
3. **Summary cards only appear after running calculation** — not persistent
4. **No Indian currency formatting** — amounts show as `30000` not `₹30,000`
5. **No employee detail drawer** — clicking employee shows full profile, not salary breakdown
6. **No "How was this calculated?" explanation** — users cannot understand why a net salary was produced
7. **No exceptions/attention panel** — missing bank details, missing structure, high LOP not highlighted
8. **No previous month comparison** — no way to see if salary changed vs last month
9. **Workflow buttons are all visible at once** — confusing, should show only valid next actions
10. **Payslip table shows raw timestamps** — not formatted dates
11. **Report table shows raw column names** with underscores — not human-readable
12. **No search/filter on payroll items table** — hard to find specific employee
13. **No department filter on payroll table**
14. **Status shown as raw string** (e.g. "pending_review") — not formatted

---

## 24. Current Salary Dashboard Cards

After running calculation, 4 cards appear:
1. Calculated (count)
2. Errors (count)
3. Total gross (number)
4. Total net (number)

These only appear **after** running calculation — not on page load.

---

## 25. Useful Cards

All 4 are useful but insufficient. Missing:
- Employees in payroll
- Total deductions
- LOP total
- Employees with errors/attention needed
- Payment status

---

## 26. Redundant Cards

None are redundant — but the set is too small.

---

## 27. Missing Benchmark UX Features

- Payroll period selector showing "September 2026" format
- Persistent status badge (Draft / Calculated / Approved / Locked / Paid)
- 6–8 KPI cards always visible
- Employee salary breakdown drawer
- "How was this calculated?" explanation
- Exceptions / Needs Attention panel
- Previous month comparison
- Indian currency formatting (₹1,25,000)
- Search + department filter on payroll table
- Formatted dates (05 Sep 2026)
- Workflow showing only valid next actions

---

## 28. Security / RLS Risks

- Payroll APIs use `createAdminClient()` (service role) — correct for server-side payroll
- Payslip downloads use signed URLs (120s expiry) — correct
- Bank account masking implemented in reports — correct
- Employee salary structure endpoint: need to verify RLS prevents employee from reading other employees' structures
- `payroll_items` table: need to verify employees cannot query other employees' rows
- Statutory data (PAN, UAN, ESI) in `employee_profile_details`: need to verify RLS
- No audit trail for who viewed a payslip (download_count tracked but not who)

---

## 29. Performance Risks

**N+1 query pattern exists in `runPayrollCalculation`:**
```
for (const emp of employees) {
  structure = await resolveSalaryStructureForDate(...)   // 1 query per employee
  { totals } = await buildAttendanceTotalsForEmployee(...)  // 3 queries per employee
  // Total: ~4 DB queries per employee
}
```
For 50 employees = ~200 sequential DB queries. This is acceptable for current scale but will slow down significantly at 100+ employees. Should be batched in future.

---

## 30. Files That Would Need Changes for UX Improvements

| File | Change Type |
|---|---|
| `components/hr-payroll/PayrollCalculateWorkbench.tsx` | Major UI redesign — month selector, KPI cards, table improvements |
| `app/api/hr/payroll/calculate/route.ts` | Add period summary data to GET response |
| `lib/hr/payslipFormat.ts` | Add Indian currency formatter (safe, no formula change) |
| `components/hr-payroll/PayslipsWorkbench.tsx` | Date formatting, status badges |
| `components/hr-payroll/PayrollReportsWorkbench.tsx` | Column name formatting |
| `components/hr-payroll/SalaryStructureWorkbench.tsx` | Minor formatting improvements |

---

## 31. Database Changes That Might Eventually Be Needed

| Change | Priority | Risk |
|---|---|---|
| Add `joining_date` / `exit_date` to payroll engine input | High | Medium — requires engine change |
| Add `statutory_rules` configuration UI | Medium | Low — table exists, just needs UI |
| Add payroll comparison table (prev month vs current) | Low | Low — read-only view |

---

## 32. Changes Safe Without Touching Salary Formulas

- Month selector → "September 2026" format
- Indian currency formatting (₹1,25,000)
- Persistent KPI cards (loaded from existing API response)
- Status badge with color coding
- Date formatting (05 Sep 2026)
- Workflow buttons showing only valid next actions
- Search + department filter on payroll table
- Column name formatting in reports
- Employee name instead of UUID in payslip table
- Exceptions panel (read-only, based on existing data)
- Previous month comparison (read-only query)

---

## 33. Recommended Implementation Phases

### Phase A — Safe UI Improvements (No formula/API changes)
1. Month selector → "Month Year" format
2. Indian currency formatting throughout
3. Persistent KPI cards (always visible, not just post-calculation)
4. Status badge with color + workflow buttons showing only valid actions
5. Search + department filter on payroll items table
6. Date formatting

### Phase B — New Read-Only Features
1. Employee salary breakdown drawer (reads existing `payroll_items` data)
2. "How was this calculated?" explanation panel
3. Exceptions / Needs Attention panel
4. Previous month comparison

### Phase C — Engine Improvements (Requires approval)
1. Mid-month joiner handling (read `joined_at` from `employee_details`)
2. Exit date handling
3. Statutory deductions configuration UI

### Phase D — Performance (Only if scale requires)
1. Batch attendance queries in `runPayrollCalculation`
