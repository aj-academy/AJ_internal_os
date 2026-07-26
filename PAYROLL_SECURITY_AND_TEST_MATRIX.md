# HR Payroll — Security Review & Test Matrix (Phases 14–15)

Last updated: 2026-07-26  
Scope: Attendance + Leave + Salary + Payroll + Payslips module in AJ OS.

---

## 1. Security review summary

### AuthZ (API)

| Surface | Guard | Notes |
|---------|-------|-------|
| Admin HR APIs | `requireAdminApiSession` | Role from DB (`profiles`), not cookie |
| Staff/employee HR APIs | `requireStaffApiSession` | Own-row filters for employee |
| Payroll cron | `CRON_SECRET` Bearer / `x-cron-secret` | No session; service-role client |
| Payslip download | Staff session + ownership / admin | Employee only if `released_at` set |
| Bank report full account | Admin only; UI defaults **masked** | Unmask via `maskBank=0` |

### RLS / Storage

| Asset | Policy |
|-------|--------|
| `payslips` table | Admin all; employee SELECT only released (`released_at not null`) |
| `salary_queries` | Own rows + admin; employee insert status=`open` |
| `payroll_*` / structures / settings | Admin write; employee read own structure/payslips |
| Storage bucket `payslips` | **Private**; **no** authenticated storage policies |
| Downloads | Service-role signed URL (~120s) after API authz |

### Data hygiene

- Push / in-app payroll messages are **generic** (no net pay, bank, UAN on lock screen).
- Missing salary structure → calculation **error**, not ₹0.
- Statutory deductions default **OFF / `not_verified`**.
- Reopen locked payroll requires **super_admin + reason** (audited).
- Audit writes via `lib/hr/auditLog.ts` → `audit_logs` (`module=hr_payroll`).

### Automation idempotency

- Table `payroll_automation_jobs` unique on `idempotency_key`.
- Claim pattern: `pending` → `processing` → `processed|failed|skipped`.
- Daily cron `/api/hr/payroll/cron/process` at `15 4 * * *` (Vercel).
- Lock + `auto_release_payslips_on_lock` enqueues generate once per period id.

### Residual risks / ops

1. Set `CRON_SECRET` in production; without it cron returns 401.
2. Confirm Storage bucket `payslips` is private after SQL run.
3. Hobby Vercel cron is once/day — do not rely on sub-daily automation.
4. Finance posting intentionally **not** wired to `finance_transactions`.
5. Legacy `leave_requests` unused by this module.

---

## 2. Full test matrix

Use real employees and attendance — no mock payroll amounts.

### A. Attendance integrity

| # | Case | Expect |
|---|------|--------|
| A1 | Duplicate check-in same day blocked | Unique `(employee_id, attendance_date)` |
| A2 | Missing check-out appears in Attendance Review | Review queue lists open days |
| A3 | Correction approve/reject | Status updates + audit row |
| A4 | Non-admin cannot PATCH review | 403 |

### B. Policies & holidays

| # | Case | Expect |
|---|------|--------|
| B1 | Publish new attendance policy | Previous open version closed (`effective_to`) |
| B2 | Holiday on working day | Excluded from chargeable leave / treated as holiday in calc |
| B3 | Weekly-off day | Not counted as absent |

### C. Leave

| # | Case | Expect |
|---|------|--------|
| C1 | Apply overlapping leave | 409 overlap |
| C2 | Apply without entitlement configured | Balance warning / block when paid |
| C3 | Approve leave | Balance burned; employee notified; audit |
| C4 | Reject leave | No balance burn; employee notified |
| C5 | Employee cancel pending | Allowed; cancel approved restores if designed |

### D. Salary structures & settings

| # | Case | Expect |
|---|------|--------|
| D1 | Publish structure | Prior open row closed; change reason required |
| D2 | Employee GET own structure | Visible; cannot POST |
| D3 | Payroll settings statutory OFF | Engine does not invent PF/ESI |
| D4 | Auto-release / notify toggles | Persist on new settings version |

### E. Payroll engine & workflow

| # | Case | Expect |
|---|------|--------|
| E1 | Calculate with missing structure | Item `error` with message |
| E2 | Calculate happy path | Items + period snapshots |
| E3 | Approve with errors remaining | Blocked |
| E4 | Lock | Items frozen; optional auto payslip job |
| E5 | Reopen as admin | 403 |
| E6 | Reopen as super_admin + reason | Back to draft; audited |
| E7 | Approved adjustments only | Pending adjustments ignored in net |

### F. Payslips

| # | Case | Expect |
|---|------|--------|
| F1 | Generate before approve | Error |
| F2 | Generate after lock | PDF in private bucket; row `generated` |
| F3 | Release | `released_at` set; employee can list/download |
| F4 | Employee download unreleased | 403 |
| F5 | Signed URL expiry | Link fails after ~120s |
| F6 | Public bucket object URL | Must not work without signed URL |

### G. Employee portal & queries

| # | Case | Expect |
|---|------|--------|
| G1 | My Payslips | Only released |
| G2 | Raise salary query | Status open; admin sees it |
| G3 | Admin resolve | Employee notified; HR response visible |
| G4 | Employee cannot resolve | PATCH 403 |

### H. Reports

| # | Case | Expect |
|---|------|--------|
| H1 | Payroll register export | Matches period nets |
| H2 | Bank transfer masked | Account shows `****` |
| H3 | Bank transfer unmask (`maskBank=0`) | Full account for admin |
| H4 | CSV / Excel / PDF download | Files open; audit `*_exported` |

### I. Automation & notifications

| # | Case | Expect |
|---|------|--------|
| I1 | Cron without secret | 401 |
| I2 | Cron with secret twice | Second run processes 0 duplicate jobs |
| I3 | Cutoff day = today | Reminder job created once |
| I4 | Lock + auto_release ON | Payslips generated/released once |
| I5 | Payslip release notify | In-app (+ FCM if devices); no amount in body |
| I6 | Admin POST `/api/hr/payroll/automation` | Runs processor; lists jobs on GET |

### J. Cross-cutting security

| # | Case | Expect |
|---|------|--------|
| J1 | Employee forge admin cookie role | Still blocked (DB role) |
| J2 | Employee IDOR payslip of peer | 403 / empty |
| J3 | Service role key not in client bundle | Confirm Next public env |
| J4 | `tsc` / build | No new HR module errors |

---

## 3. SQL run order (payroll)

1. `hr_payroll_01_attendance_integrity.sql`
2. `hr_payroll_02_attendance_policies.sql`
3. `hr_payroll_03_holidays.sql`
4. `hr_payroll_04_leave_management.sql`
5. `hr_payroll_05_salary_structures.sql`
6. `hr_payroll_06_payroll_settings.sql`
7. `hr_payroll_07_payroll_engine.sql`
8. `hr_payroll_08_10_workflow_adjustments.sql`
9. `hr_payroll_11_13_payslips_queries.sql`
10. `hr_payroll_14_automation.sql`

Env: `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, optional Firebase admin for FCM.

---

## 4. Sign-off checklist

- [ ] All SQL through Phase 14 applied on target project
- [ ] `payslips` bucket private verified in Supabase dashboard
- [ ] Cutoff / auto-release settings reviewed with HR
- [ ] Test matrix A–J executed on staging with real sample employees
- [ ] Production `CRON_SECRET` set; both crons listed in Vercel
- [ ] No public Storage policies on `payslips`
