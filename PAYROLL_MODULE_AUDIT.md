# PAYROLL_MODULE_AUDIT.md

**Module:** HR, Attendance & Payroll for **AJ OS** (`AJ_Academy_OS` + `AJ_Academy_SB`)
**Scope of this document:** Phases 1–4 only — complete application audit, current-feature inventory, database mapping, and phased implementation plan.
**Status:** Audit complete. **No implementation code or migrations have been written yet** (per the "audit first" instruction).

> All findings below are grounded in the actual repository. File paths and column names are quoted from source, not assumed. Where something does not exist, it is reported as missing rather than invented.

---

## 0. Executive summary

- **Attendance capture EXISTS and is reusable.** `public.attendance_records` stores check-in/out timestamps, geolocation, selfie, and `total_working_minutes`. This is the single source of truth for attendance and **must be reused** — do not build a second attendance system.
- **A real payroll module does NOT exist.** A full-folder search of `AJ_Academy_SB` for `salary / payroll / payslip / ctc / wage / allowance / deduction / incentive / hra / pf / esi / tds / net_pay / gross` returns **only 3 hits, none of them employee compensation**: `clients.current_salary` and `clients.target_salary` (CRM lead fields) and a seeded finance category string `'Employee Salary'`.
- **Employee KYC/bank/PAN EXISTS** in `employee_profile_details` (`bank_name`, `account_number`, `ifsc_code`, `branch_name`, `pan_number`, `aadhaar_number`, `upi_id`). **UAN and ESI number are MISSING.**
- **Leave is effectively NOT usable today.** `leave_requests` exists in schema but has **no create/approve UI**, and `remove_leave_requests_module.sql` may have dropped it. `permission_requests` is the only fully working request→approve workflow. **No holiday or weekly-off concept exists anywhere.**
- **Infra to build payroll EXISTS:** client-side `jspdf`/`jspdf-autotable`, `xlsx`, CSV helpers, `in_app_notifications` + FCM push, private `employee-documents` storage bucket + signed-URL pattern, service-role admin client, `is_admin()`-based RLS conventions, and one Vercel cron.
- **Two critical data-integrity gaps** must be fixed before payroll can be trusted:
  1. `attendance_records` has **no unique constraint** on `(employee_id, attendance_date)` → duplicate day rows are possible.
  2. `attendance_records.status` is **free text with no CHECK** and the check-in flow only ever writes `"present"` / `"completed"` — late/absent/half-day are not derived from data anywhere except one analytics RPC.
- **`audit_logs` table EXISTS but is never written to.** `logSecurityEvent` only does `console.info`. Payroll audit trail needs real DB inserts.

**Recommendation:** Build a **new payroll domain** (new tables, effective-dated) that **reads** existing attendance/leave/profile data. Do not modify the check-in flow. Fix attendance data-integrity and derive statuses in a computed layer, not by rewriting historical rows.

---

## A. Features already available and working

| # | Feature | Evidence |
|---|---------|----------|
| A1 | Check-in / check-out with gelocation + selfie | `components/attendance/MemberAttendancePage.tsx`; table `attendance_records` (`attendance_module.sql` L49–68) |
| A2 | `total_working_minutes` computed on checkout | `MemberAttendancePage.tsx` L522–533 (`ceil((out−in)/60000)`) |
| A3 | End-of-day work summary + admin review | `work_summaries` (`attendance_module.sql` L110–122; review cols `analytics_reporting_schema.sql` L9–13) |
| A4 | Admin attendance logs view + delete (single/bulk) | `app/admin/attendance/actions.ts` L146–178; `attendance_delete_grants.sql` |
| A5 | Permission request → approve/reject workflow | `app/employee/permission/actions.ts`; `permission_requests` (+ `employee_module_schema.sql` L4–7) |
| A6 | Employee profile incl. bank/PAN/Aadhaar KYC | `employee_profile_details` (`employee_profile_self_service_schema.sql` L40–114) |
| A7 | Employee documents + verification, private bucket | `employee_documents`; bucket `employee-documents` (private, L198–206) |
| A8 | Roles + role helpers + API session guards | `is_admin()`, `requireAdminApiSession`, `requireStaffApiSession` (`lib/security/**`) |
| A9 | In-app notifications + FCM push (server send) | `in_app_notifications.sql`; `lib/push/sendPushNotification.ts` |
| A10 | PDF/Excel/CSV export helpers | `components/reports/reportsExport.ts`, `reportsExportMeta.ts`, `lib/csv.ts` |
| A11 | Signed-URL private file access + service-role upload | `app/api/proposals/signed-url/route.ts`, `app/api/proposals/upload/route.ts` |
| A12 | Cron pattern with `CRON_SECRET` | `vercel.json` (`0 4 * * *`), `app/api/reminders/cron/process-alerts/route.ts` |
| A13 | System settings store (JSON keys) incl. `company`, `attendance`, `hr_org` | `system_settings_schema.sql` L66–80 |
| A14 | Per-employee analytics rollup RPC (attendance present-days + working-minutes) | `analytics_employee_day_rollups()` (`analytics_reporting_schema.sql` L73) |

---

## B. Features available but incomplete

| # | Feature | What's incomplete |
|---|---------|-------------------|
| B1 | `attendance_settings` (office geo, `late_after_time`, `half_day_minimum_minutes`) | Schema exists (`attendance_module.sql` L126–139) but **no app reads it**; admin settings tab was removed (redirect at `admin/attendance/page.tsx` L319–321). No effective-dating. |
| B2 | Attendance status semantics | `status` free text, no CHECK; only `present`/`completed` written. Late/absent/half-day exist only as **filter labels** + one analytics RPC (`analytics_reporting_schema.sql` L167). |
| B3 | `leave_requests` | Table defined twice; **no insert/approve UI in app**; may be dropped by `remove_leave_requests_module.sql`. No leave-balance/quota table. |
| B4 | `work_from_home_requests` | Table + RLS exist; **no submit/approve UI**. Admin dashboard only counts statuses. |
| B5 | `audit_logs` | Table exists; **never written**. `logSecurityEvent` = `console.info` only (`lib/security/auditLog.ts`). Only RLS policy lives in do-not-run `rls-policies.sql`. |
| B6 | Company branding | `company` settings JSON has `companyName/address/logoUrl`, but legal name **"AchieversJournal" is absent** (branding uses "AJ Academy"); logo assets are generated, not tracked. |
| B7 | `employee_code` | Selected in UI (`EmployeeProfileWorkbench.tsx`) but **not in any SQL** — app-only/undefined column. |
| B8 | `finance_transactions` employee link | Has `employee_id` FK + `'Employee Salary'` category **string** — usable as a payout ledger target, but no salary structure feeds it. |

---

## C. Features created only in UI but not connected to data

| # | Feature | Note |
|---|---------|------|
| C1 | Admin attendance "settings" / "leave" / "wfh" tabs | Query params redirected away — UI entry points exist but lead nowhere (`admin/attendance/page.tsx` L319). |
| C2 | Leave summary counts (employee) | `EmployeeMyLeaveContent.tsx` reads `leave_requests` counts but there is no way to create leave, so it renders against an empty/absent table. |
| C3 | Permission push copy | Push text says "Leave Request Approved" for permission actions (`app/employee/permission/actions.ts` L89–92) — mismatched wording. |

*(No mock/dummy payroll UI exists — there is simply no payroll UI at all yet.)*

---

## D. Features that are missing (must be built)

Attendance policy engine (effective-dated) · Holiday calendar · Weekly-off configuration · Leave types + balances + accrual + carry-forward · Leave apply/approve workflow · Attendance review/correction queue · Employee **salary structures (effective-dated)** · Salary components (basic/HRA/allowances/deductions) · Payroll settings (divisor, cutoffs, payslip numbering) · **Server-side payroll calculation engine** · Payroll period + status workflow (Draft→…→Paid) · Salary adjustments (approval-gated) · Payroll approval + lock + reopen · **Payslip PDF generation + storage + release** · Employee payroll portal · Payroll reports (register, bank transfer, LOP, overtime, etc.) · Salary query management · Payroll-specific RLS + storage policies · **Real audit-log writes** · Payroll cron automation (idempotent) · Statutory config (PF/ESI/PT/TDS as configurable, unverified by default).

---

## E. Existing tables/columns that can be REUSED

| Concept | Reuse | Source |
|---------|-------|--------|
| Employee identity | `profiles` (`id, full_name, email, role, department, designation, status`) | `schema.sql` L1–10 |
| Joining date / employment type / manager | `employee_details` (`joined_at`, `employment_type`, `manager_id`) | `schema.sql` L14–21; `employee_profile_self_service_schema.sql` L5–7 |
| Bank / PAN / Aadhaar / UPI | `employee_profile_details` (`bank_name, account_holder_name, account_number, ifsc_code, branch_name, upi_id, pan_number, aadhaar_number`) | `employee_profile_self_service_schema.sql` L95–103 |
| Attendance facts | `attendance_records` (`check_in_time, check_out_time, total_working_minutes, status, attendance_date`) | `attendance_module.sql` L49–68 |
| Attendance policy seeds | `attendance_settings` (`late_after_time, half_day_minimum_minutes, standard_check_in/out_time`) | `attendance_module.sql` L126–139 |
| Permission requests | `permission_requests` | `attendance_module.sql` L86–97 |
| Config store | `system_settings` (add `payroll` key) | `system_settings_schema.sql` |
| Notifications | `in_app_notifications` + FCM | `in_app_notifications.sql`, `lib/push/*` |
| Audit table | `audit_logs` (start writing to it) | `schema.sql` L25–35 |
| Payout ledger (optional) | `finance_transactions` (`employee_id`, category `'Employee Salary'`) | `finance_schema.sql` L30–48 |
| Private storage + signed URLs | `employee-documents` bucket pattern → new `payslips` bucket | `employee_profile_self_service_schema.sql` L198–206 |

---

## F. Missing tables / columns (new migrations required)

**New tables (proposed):**
`payroll_leave_types`, `payroll_leave_balances`, `leave_applications` (or complete `leave_requests`), `holidays`, `weekly_off_settings` (or `attendance_policies` with effective dates), `attendance_policies`, `attendance_corrections`, `employee_salary_structures` (effective-dated), `salary_components` (or JSONB components on structure), `payroll_settings` (or `system_settings.payroll`), `payroll_periods`, `payroll_items` (per-employee run result, immutable when locked), `payroll_item_components`, `salary_adjustments`, `payslips`, `salary_queries`, `payroll_audit_logs` (or reuse `audit_logs`).

**New columns (proposed, additive):**
`profiles`/`employee_details`: none required if we key salary structures by `profile_id`.
`employee_profile_details`: `uan_number text`, `esi_number text` (MISSING today).
`attendance_records`: **add `UNIQUE(employee_id, attendance_date)`** (data-integrity fix; requires dedupe first) and consider `source`/`is_corrected` flags — decision deferred to Phase 5.

---

## G. Existing business rules identified from code

- **Working minutes:** `ceil((check_out − check_in) / 60000)`, minimum 1 (`MemberAttendancePage.tsx` L522–524).
- **Check-in status:** always `"present"`; checkout sets `"completed"`; `location_type` always `"Remote"` (hardcoded).
- **"Present" for analytics:** `status ∈ {present, completed, late}` case-insensitive (`analytics_reporting_schema.sql` L167).
- **Analytics rollup scope:** only `role='employee'` AND `status='active'` (excludes mentors/freelancers) (`analytics_reporting_schema.sql` L96–101).
- **Permission workflow:** `pending → approved/rejected`, sets `approved_by`, `approved_at`, optional `rejection_reason`.
- **Expense claim → ledger:** approving an `expense_claims` row auto-inserts a `finance_transactions` Expense (`expense_claims_after_approval_trigger`, `finance_schema.sql` L299) — a precedent pattern for posting payroll to finance.
- **Half-day/late knobs:** only `half_day_minimum_minutes` (240) and `late_after_time` exist, unused.

---

## H. Existing role permissions

| Role | Source of truth |
|------|-----------------|
| `super_admin`, `admin`, `employee`, `student`, `freelancer`, `mentor` | `profiles.role` CHECK (`schema.sql` L5; `add_employee_role.sql`) |
| Admin API gate | `requireAdminApiSession()` → `admin`, `super_admin` |
| Staff API gate | `requireStaffApiSession()` → `admin`, `super_admin`, `employee` |
| Super-admin-only actions | `assertSuperAdminActor` |
| Layout gating | `requireRole([...])` in `app/admin/layout.tsx`, `app/employee/layout.tsx` |
| RLS predicate | `is_admin()` = role in (`admin`,`super_admin`) |

**Legacy leftovers:** `manager` / `accounts` referenced by helpers (`is_manager()`, `is_accounts()`, `finance_is_privileged()`) but **not in the role CHECK** → currently unreachable branches. A payroll "Manager" role must be modeled via `employee_details.manager_id`, not the `manager` role.

---

## I. Existing technical limitations

1. Attendance/check-in writes go **directly from browser** to Supabase (no server action) — payroll must not depend on trusting client writes for pay-affecting values.
2. **No unique `(employee_id, attendance_date)`** constraint → duplicate day rows possible.
3. PDF/Excel are **client-side only** — synchronous bulk payslip generation in the browser will not scale; needs a batched/server approach.
4. Hobby-tier Vercel cron runs **once/day**; automation must be idempotent and tolerate manual triggers.
5. `audit_logs` not wired; `logSecurityEvent` is console-only.
6. Pre-existing Firebase TS module-resolution errors exist (unrelated) — must not be conflated with payroll build errors.
7. `finance_schema.sql` is marked **optional/skippable** in setup order → its presence per environment is uncertain; payroll should not hard-depend on it.
8. `reimbursement-bills` bucket is **public** and readable by any authenticated user — do NOT follow that pattern for payslips; use the **private** `employee-documents` model.

---

## J. Existing data-quality issues

- Duplicate attendance rows per employee/day are possible (no unique index).
- `attendance_records.status` inconsistent/free-text; late/absent not derived.
- Leave data may be absent (table possibly dropped) — cannot assume leave history exists.
- `employee_code` referenced in UI but undefined in schema.
- Two conflicting `system_settings` definitions (`description` column presence is environment-dependent).
- `attendance_settings` may have zero rows (never populated by app).

---

## Per-feature detail (required format)

### Feature: Attendance capture (check-in/out)
- **Current status:** EXISTS (reuse as-is)
- **Existing files:** `components/attendance/MemberAttendancePage.tsx`; `AJ_Academy_SB/attendance_module.sql`
- **Existing database source:** `attendance_records`
- **What works:** timestamps, geo, selfie, `total_working_minutes`
- **What is missing:** unique day constraint; derived late/half-day/absent; break/early-exit
- **Recommended action:** Reuse; add computed status layer + unique index; never rewrite historical rows
- **Migration required:** Yes (unique index after dedupe; no schema rewrite of capture)
- **Risk level:** Medium (data integrity)

### Feature: Attendance policy settings
- **Current status:** PARTIAL (schema only, unused)
- **Existing files:** `attendance_module.sql` (`attendance_settings`)
- **Existing database source:** `attendance_settings`
- **What works:** columns for geo radius, `late_after_time`, `half_day_minimum_minutes`
- **What is missing:** effective-dating, grace period, OT rules, salary-day method, app read/write
- **Recommended action:** New `attendance_policies` with `effective_from`; migrate seeds; read server-side
- **Migration required:** Yes
- **Risk level:** Medium

### Feature: Leave management
- **Current status:** PARTIAL/MISSING (no working workflow; table may be dropped)
- **Existing files:** `attendance_module.sql`, `employee_module_schema.sql`, `remove_leave_requests_module.sql`, `EmployeeMyLeaveContent.tsx`
- **Existing database source:** `leave_requests` (uncertain existence)
- **What works:** read-only summary counts
- **What is missing:** leave types, balances, accrual, carry-forward, apply/approve UI+API, attendance/payroll linkage
- **Recommended action:** Build leave module (types + balances + applications) reusing permission-workflow patterns; treat `leave_requests` as legacy
- **Migration required:** Yes (new tables)
- **Risk level:** High (payroll depends on approved leave)

### Feature: Holiday calendar & weekly-off
- **Current status:** MISSING
- **Existing files:** none
- **Existing database source:** none
- **What works:** nothing
- **What is missing:** everything
- **Recommended action:** New `holidays` + weekly-off config (part of `attendance_policies`)
- **Migration required:** Yes
- **Risk level:** High (payable-days calc needs it)

### Feature: Employee salary structure
- **Current status:** MISSING
- **Existing files:** none (bank/PAN reused from `employee_profile_details`)
- **Existing database source:** none for pay
- **What works:** KYC/bank only
- **What is missing:** all compensation data, effective-dating, UAN/ESI
- **Recommended action:** New `employee_salary_structures` (effective-dated, close-out on change, audited) + components; add `uan_number`/`esi_number` to `employee_profile_details`
- **Migration required:** Yes
- **Risk level:** High

### Feature: Payroll settings
- **Current status:** MISSING (settings store exists)
- **Existing files:** `system_settings_schema.sql`, `app/api/admin/settings/route.ts`
- **Existing database source:** `system_settings` (add `payroll` key) or new table
- **What works:** JSON settings CRUD pattern + `company` branding key
- **What is missing:** payroll divisor, cutoffs, payslip numbering, release rules
- **Recommended action:** Add `payroll` settings key (or `payroll_settings` table for effective-dating)
- **Migration required:** Yes (minor)
- **Risk level:** Medium

### Feature: Payroll calculation engine
- **Current status:** MISSING
- **Existing files:** none (`analytics_employee_day_rollups()` is closest input aggregator)
- **Existing database source:** derives from `attendance_records`, leave, salary structures
- **What works:** attendance rollup RPC for present-days/minutes
- **What is missing:** entire server-side engine, reproducible/locked results
- **Recommended action:** Server-side engine (API/RPC), store inputs+policies+version; immutable on lock
- **Migration required:** Yes (`payroll_periods`, `payroll_items`, component tables)
- **Risk level:** High

### Feature: Payslip generation
- **Current status:** MISSING
- **Existing files:** `components/reports/reportsExport.ts` (jspdf), `employee-documents` bucket pattern
- **Existing database source:** none
- **What works:** client PDF; private storage + signed URLs
- **What is missing:** payslip layout, batched/server generation, `payslips` table + private bucket, release/download tracking
- **Recommended action:** New private `payslips` bucket + `payslips` table; batched generation post-lock; signed-URL access
- **Migration required:** Yes
- **Risk level:** High (PII security)

### Feature: Audit logging
- **Current status:** PARTIAL (table exists, unused)
- **Existing files:** `lib/security/auditLog.ts` (console only)
- **Existing database source:** `audit_logs`
- **What works:** table shape (`actor_id, action, module, target_table, old_data, new_data`)
- **What is missing:** actual inserts, RLS read policy (non-legacy)
- **Recommended action:** Write real audit rows for all payroll-sensitive ops; add admin-read RLS
- **Migration required:** Yes (RLS policy)
- **Risk level:** Medium

### Feature: Notifications & automation
- **Current status:** EXISTS (reusable)
- **Existing files:** `lib/push/sendPushNotification.ts`, `vercel.json`, `api/reminders/cron/*`
- **Existing database source:** `in_app_notifications`, `push_devices`
- **What works:** in-app + FCM send; cron w/ `CRON_SECRET`
- **What is missing:** payroll-specific triggers + idempotent monthly job
- **Recommended action:** Reuse; add idempotent payroll cron keyed by period
- **Migration required:** No (reuse) / minor
- **Risk level:** Low

---

## Phase 3 — Database & feature mapping (required source for every metric)

| Required data | Existing source | Verdict |
|---------------|-----------------|---------|
| Employee | `profiles` + `employee_details` | REUSE |
| Attendance (check-in/out) | `attendance_records` | REUSE |
| Working hours | `attendance_records.total_working_minutes` (+ derive from timestamps) | REUSE |
| Leave | `leave_requests` (unreliable) → **new leave module** | NEW |
| Holiday | — | NEW (`holidays`) |
| Weekly off | — | NEW (`attendance_policies`) |
| Salary structure | — | NEW (`employee_salary_structures`) |
| Payroll period | — | NEW (`payroll_periods`) |
| Adjustments | `expense_claims` (reimbursement only) → **new** | NEW (`salary_adjustments`) |
| Payslip | `employee-documents` bucket pattern → **new** | NEW (`payslips` + bucket) |
| Audit history | `audit_logs` | REUSE (start writing) |
| Bank details | `employee_profile_details` | REUSE |
| UAN/ESI | — | NEW columns |

**Per-metric data source:**

| Metric | Source / derivation |
|--------|---------------------|
| Present days | `attendance_records` where derived status ∈ present/completed/late |
| Absent days | working-day calendar − present − paid/unpaid leave − holiday − weekly-off |
| Paid / Unpaid leave | approved rows in new leave module, by leave-type `is_paid` |
| Half days | `total_working_minutes < policy.min_full_day` and `≥ policy.min_half_day` |
| Missing check-outs | `check_in_time NOT NULL AND check_out_time IS NULL` → Attendance Review queue |
| Late arrivals | `check_in_time::time > policy.late_after_time (+grace)` |
| Early exits | `check_out_time::time < policy.standard_check_out_time` |
| Working hours | `total_working_minutes` (fallback: out−in) |
| Overtime | minutes beyond policy threshold, if OT enabled + approved |
| Payable days | policy salary-day method applied to present + paid leave + holiday + weekly-off |
| Gross earnings | salary structure components pro-rated by payable days + approved additions |
| Total deductions | LOP + approved deductions + configured statutory |
| Net salary | gross − deductions (never negative; block + alert) |

> **Rule enforced by design:** if a required source does not exist (e.g. no salary structure, no holidays configured), the engine **stops with an actionable error** and does **not** emit zero salary.

---

## Phase 4 — Phased implementation plan

Each phase ends with: run app · verify DB ops · test buttons · verify permissions · verify calculations · `tsc` + build · fix before next phase.

1. **Attendance integrity & derived status** — dedupe + unique index; server-side status derivation layer (no historical rewrite); Attendance Review queue for missing check-outs.
2. **Attendance policy settings** — `attendance_policies` (effective-dated) incl. weekly-off; migrate `attendance_settings` seeds.
3. **Holiday calendar** — `holidays` table + admin CRUD.
4. **Leave management** — leave types, balances, applications, apply→manager→HR approval; only approved leave affects attendance/payroll.
5. **Employee salary structures** — effective-dated, close-out-on-change, audited; add `uan_number`/`esi_number`.
6. **Payroll settings** — `payroll` settings key/table (divisor, cutoffs, payslip numbering, release rules).
7. **Payroll calculation engine** — server-side, reproducible, versioned, locked-immutable.
8. **Monthly payroll workflow** — `payroll_periods` + `payroll_items`; statuses Draft→…→Paid.
9. **Salary adjustments** — approval-gated additions/deductions.
10. **Payroll review & approval + lock/reopen** — super-admin-only reopen with reason.
11. **Payslip generation** — private `payslips` bucket, batched generation post-lock, signed URLs.
12. **Employee payroll portal** — own attendance/leave/salary/payslips only.
13. **Reports & exports** — register, bank transfer (restricted+masked), LOP, OT, etc. (Excel/CSV/PDF/Print) with server-side filters.
14. **Notifications & idempotent automation** — reuse in-app/FCM + payroll cron keyed by period.
15. **Audit logging everywhere** + **RLS/storage security review** + **full test matrix** (Phases 20–27 of the brief).

---

## Open decisions for you (before Phase 1 build)

1. **Legal entity name/branding on payslips** — brief says "AchieversJournal Private Limited", but the app uses "AJ Academy" and no such string exists. Which name + logo asset should payslips use?
2. **Manager role** — there is no `manager` role in the CHECK; use `employee_details.manager_id` for the manager-approval step? (recommended)
3. **Statutory (PF/ESI/PT/TDS)** — leave **unconfigured/labelled "not verified"** by default (per Phase 28)? (recommended — no hardcoded statutory math)
4. **Finance posting** — should approved+paid payroll post an Expense row into `finance_transactions` (mirroring `expense_claims`), or stay isolated in payroll tables for now?
5. **Leave table** — build fresh `leave_applications` and treat `leave_requests` as legacy, or resurrect/extend `leave_requests`? (fresh recommended)

---

*Prepared as Phase 1–4 deliverable. Implementation will proceed phase-by-phase only after these decisions are confirmed, so migrations and pages are built against verified requirements rather than assumptions.*
