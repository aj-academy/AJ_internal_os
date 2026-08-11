# Phase 6A — Profiles RLS Root Cause (verification only)

**Date:** 11 August 2026  
**Mode:** Inspect / compare / report only  
**Changes applied:** **none** (no SQL applied, no policies dropped, no RLS toggled, no app code changed)  
**Related:** [`PHASE_6_AUTHORIZATION_RLS_REPORT.md`](./PHASE_6_AUTHORIZATION_RLS_REPORT.md) — CRITICAL student→other-student `profiles` SELECT  

---

## 1. Can we list live `pg_policies` via API?

| Method | Result |
|--------|--------|
| PostgREST `pg_catalog.pg_policies` | **Blocked** — `Invalid schema: pg_catalog` |
| PostgREST `information_schema` | **Blocked** — `Invalid schema: information_schema` |
| Helper RPCs (`exec_sql`, etc.) | **Not present** |
| Direct Postgres URL / `psql` | **Not configured** in local env (no `DATABASE_URL`) |

**Therefore:** exact live policy **names** and **USING** text could **not** be dumped from the catalog in this session.

What **was** established with high confidence is the **effective SELECT behavior** under real QA JWTs (same project the app uses). A short read-only confirmation query for the Supabase SQL Editor is included at the end so you can paste the live policy list before approving any fix.

---

## 2. RLS enabled: yes / no

| Probe | Result | Interpretation |
|-------|--------|----------------|
| Unauthenticated anon `SELECT` on `profiles` | **0 rows**, no error | Not a fully open table to the world |
| Authenticated **student** JWT `SELECT` | **35 rows** (all roles) | Authenticated reads are fully open |
| Service role count | **35** profiles | Matches authenticated breadth |

**RLS enabled: yes (effective)** — most consistent with:

- RLS **ON**, plus a **permissive** authenticated SELECT policy equivalent to `USING (true)`, **or**
- RLS ON with multiple permissive policies whose OR includes a broad `USING (true)`.

**RLS fully OFF** is **unlikely**: anon would often still see rows if `GRANT SELECT` is open; here anon sees **0**.

---

## 3. Active policies (effective behavior + repo source of truth)

### 3.1 Effective live SELECT behavior (measured)

Read-only probe: `AJ_Academy_OS/scripts/phase6a-profiles-visibility-probe.mjs`  
Artifacts: `AJ_Academy_OS/test-results/phase6a-*-profiles-probe.json`

| Actor (JWT) | Rows returned | Other students | Admins | Mentors | Other staff | Roles visible |
|-------------|--------------:|---------------:|-------:|--------:|------------:|---------------|
| **Student** | 35 | 20 | 4 | 1 | 9 | admin, freelancer, mentor, employee, student |
| **Mentor** | 35 | 21 | 4 | 1 | 9 | same set |
| **Admin** | 35 | 21 | 4 | 1 | 9 | same set |
| **Anon** | 0 | — | — | — | — | — |

**Inference:** any logged-in user can read the **entire** `profiles` table (PII: names/emails/roles/etc. depending on column select). This is **not** explainable by the tightened policy set alone.

### 3.2 Policies defined in repo SQL (what *should* / *may* exist)

#### A. Broad policy — `AJ_Academy_SB/profiles_rls_fix.sql` (setup step **8**, required for login)

| Field | Value |
|-------|--------|
| **Policy name** | `profiles_authenticated_read` |
| **Roles targeted** | `authenticated` |
| **Commands** | `SELECT` |
| **USING** | `true` |
| **WITH CHECK** | n/a |
| **Permissive / restrictive** | **PERMISSIVE** (Postgres default; not `AS RESTRICTIVE`) |
| **Effect** | **Every authenticated role can read every profile row** |

Also creates `get_my_profile()` **SECURITY DEFINER** (`row_security = off`) for login — **independent** of table SELECT policies.

#### B. Tighten set — `AJ_Academy_SB/profiles_rls_tighten.sql` (setup step **8d**, marked **recommended**)

| Action | Detail |
|--------|--------|
| **Drops** | `profiles_authenticated_read` |
| **Adds** | See table below |

| Policy name | Roles | Command | USING (summary) | Type |
|-------------|-------|---------|-----------------|------|
| `profiles_self_select` | authenticated | SELECT | `id = auth.uid()` | permissive |
| `profiles_admin_select` | authenticated | SELECT | `public.is_admin()` | permissive |
| `profiles_mentor_students_select` | authenticated | SELECT | mentor role **and** student row **and** (`assigned_mentor_id = auth.uid()` **OR** same `department`) | permissive |
| `profiles_student_read_mentor` | authenticated | SELECT | student role **and** `get_my_assigned_mentor_id() = id` | permissive |
| `profiles_employee_read_manager` | authenticated | SELECT | manager via `employee_details` | permissive |

Helpers (SECURITY DEFINER, `row_security = off`): `is_admin()`, `get_my_department()`, `get_my_assigned_mentor_id()`.

#### C. Later overlays (do **not** remove the broad policy by themselves)

| File | Relevant effect |
|------|-----------------|
| `security_rls_access_fix.sql` | Recreates admin/mentor/student profile SELECT policies; **does not `DROP profiles_authenticated_read`** |
| `employee_student_master_rls.sql` | Adds `profiles_employee_crm_select` (`is_employee()`) — still **not** “all students for students” |
| `attendance_module.sql` | Older `profiles_self_read` / `profiles_admin_read_all` — superseded/dropped by `profiles_rls_fix.sql` in the intended order |

### 3.3 Catalog confirmation SQL (for you to run — read-only)

Run in **Supabase → SQL Editor** (SELECT only). Paste results before approving a fix:

```sql
-- RLS flag
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'profiles';

-- Every policy on public.profiles
select
  pol.polname as policy_name,
  case pol.polcmd
    when 'r' then 'SELECT'
    when 'a' then 'INSERT'
    when 'w' then 'UPDATE'
    when 'd' then 'DELETE'
    when '*' then 'ALL'
  end as command,
  pol.polpermissive as permissive,  -- true = PERMISSIVE
  pg_get_expr(pol.polqual, pol.polrelid) as using_expression,
  pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_expression,
  array(
    select rolname from pg_roles where oid = any (pol.polroles)
  ) as roles_targeted  -- empty array means PUBLIC
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'profiles'
order by pol.polname;
```

**Expected if root cause holds:** `rls_enabled = true` and a policy named **`profiles_authenticated_read`** (or equivalent) with `using_expression = true` (or `true`-equivalent), `command = SELECT`, `permissive = true`, role `authenticated`.

---

## 4. Multiple permissive policies — do they combine?

**Yes.** For PostgreSQL RLS **PERMISSIVE** policies on the same command: access is allowed if **ANY** policy’s `USING` passes (OR).

So if both exist:

- `profiles_authenticated_read` → `USING (true)`  
- **and** `profiles_self_select` / mentor / admin policies  

…the broad policy **alone** still allows every authenticated user to read every row. Tightened policies cannot “cancel” a permissive `USING (true)`.

**Restrictive** policies would AND; none of the repo profile scripts create `AS RESTRICTIVE` policies.

---

## 5. Exact root cause

### Primary root cause (high confidence)

**Effective SELECT on `public.profiles` for `authenticated` is unrestricted (`USING (true)`-equivalent).**  

In this repository that policy is explicitly:

```text
profiles_authenticated_read
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);
```

from `AJ_Academy_SB/profiles_rls_fix.sql`.

### Why Phase 6 saw student→student reads

Under **only** `profiles_rls_tighten.sql` policies, a **student** must **not** read another **student** row:

| Policy | Other student row? |
|--------|--------------------|
| `profiles_self_select` | No (`id ≠ auth.uid()`) |
| `profiles_admin_select` | No (not admin) |
| `profiles_mentor_students_select` | No (not mentor role) |
| `profiles_student_read_mentor` | Only if that id is **their mentor**, not another student |
| `profiles_employee_read_manager` | No |

Measured live: student sees **20 other students + admins + employees + mentor**. That matches **`USING (true)`**, not the tighten matrix.

### Why tighten likely is not active (or was undone)

| Evidence | Detail |
|----------|--------|
| Setup order | `profiles_rls_tighten.sql` is **8d recommended**, not required |
| `security_rls_access_fix.sql` | Restores scoped policies but **never drops** `profiles_authenticated_read` |
| Behavior | Identical full-table read for student, mentor, and admin JWTs |

**Secondary possibility (lower probability):** another permissive policy with `USING (true)` / always-true expression under a different name. Confirmation SQL above will name it.

---

## 6. Impact by role

### Student

| Impact | Detail |
|--------|--------|
| **Security** | **CRITICAL** — can enumerate other students’ profile rows (and currently staff profiles too) via PostgREST / browser Supabase client |
| **Privacy** | Emails, names, roles, departments, mentor ids, etc. (whatever columns are selected) |
| **App UX** | Own profile UI still works; defect is **excess** access, not missing access |

### Mentor

| Impact | Detail |
|--------|--------|
| **Security** | Same broad read today (sees all 35 profiles), not limited to mentees / department |
| **After proper tighten** | Should retain mentees + **same-department students** via `profiles_mentor_students_select`; must **not** rely on `USING (true)` |
| **App** | Many mentor LMS APIs use server `createClient()` + RPCs / allocations; UI pieces that `select` from `profiles` with user JWT (e.g. own `department` by `id = user.id`) remain OK under `profiles_self_select` |

### Admin

| Impact | Detail |
|--------|--------|
| **Security** | Broad read is **intended for admins** functionally, but today it is implemented by a **global** policy that also opens students/mentors |
| **After proper tighten** | `profiles_admin_select` + `is_admin()` preserves admin directory reads **without** student-to-student leakage |
| **App dependency on broad policy** | **Weak for server routes:** e.g. `/api/admin/students/directory` uses **`createAdminClient()` (service role)** and bypasses RLS. **Stronger for client workbenches** that call `supabase.from("profiles")` with the user session (Settings, Student Master pickers, Finance, College Visits, etc.) — those need **`profiles_admin_select`** (or employee CRM select), **not** `USING (true)` |

**Conclusion:** Admin/Mentor product features do **not** require keeping `profiles_authenticated_read`. They require the **scoped** policies (and service-role admin APIs already bypass RLS).

---

## 7. Proposed minimal safe fix (DO NOT APPLY YET)

**Goal:** remove the broad OR-allow while preserving login + admin/mentor/employee legitimate reads.

### Minimal steps (conceptual)

1. **Drop** `profiles_authenticated_read` (or any live policy whose `USING` is effectively `true` for `SELECT` to `authenticated`).
2. **Ensure** these exist (idempotent recreate as in `profiles_rls_tighten.sql`):
   - `profiles_self_select`
   - `profiles_admin_select`
   - `profiles_mentor_students_select`
   - `profiles_student_read_mentor`
   - `profiles_employee_read_manager`
3. **Keep** `get_my_profile()` SECURITY DEFINER (login path).
4. If CRM employee name lists break, **keep/add** `profiles_employee_crm_select` from `employee_student_master_rls.sql` (employee-only — still not student-to-student).
5. Prefer also ensuring `security_rls_access_fix.sql` helpers (`get_user_role`, `is_admin`, …) are present so `is_admin()` does not recurse.

**Preferred vehicle:** run **`profiles_rls_tighten.sql`** in SQL Editor after catalog confirmation (it already drops `profiles_authenticated_read` and recreates scoped policies). Optionally re-check `security_rls_access_fix.sql` helpers if admin dashboards go empty.

**Not minimal / avoid in first pass:** rewriting mentor same-department rule (broader product decision); that is separate from this CRITICAL leak.

---

## 8. Rollback SQL (prepare before apply; do not run now)

```sql
-- ROLLBACK: restore broad authenticated read (previous insecure-but-login-safe behavior)
drop policy if exists profiles_authenticated_read on public.profiles;
create policy profiles_authenticated_read
on public.profiles
for select
to authenticated
using (true);
```

Notes:

- Rollback **re-opens** the CRITICAL leak — use only if tighten breaks production login/admin UI and you need an emergency reopen.
- Prefer fixing missing `is_admin()` / grants over rolling back to `USING (true)` when possible.

---

## 9. Tests required after the fix

| # | Test | Expected |
|---|------|----------|
| 1 | Re-run catalog SQL in §3.3 | `profiles_authenticated_read` **absent**; scoped policies **present**; `rls_enabled = true` |
| 2 | Student JWT: `select id,role from profiles` | Own row (+ assigned mentor only); **0** other students; **0** admins/employees |
| 3 | Repeat Phase 6 `STU-RLS-PROFILE` | **Pass** |
| 4 | Student UI `/student/profile` + login | Still works (`get_my_profile` + self select) |
| 5 | Mentor JWT: can read assigned / same-dept students; cannot read out-of-scope student | Pass (needs `E2E_UNRELATED_STUDENT_ID` if all current students are in-scope) |
| 6 | Admin JWT or admin UI: student directory / settings profile pickers | Still list students/staff as required |
| 7 | Anon SELECT profiles | Still 0 rows |
| 8 | Phase 5 smoke once | No login regression |
| 9 | Optional: employee CRM assignee dropdown | Still loads employees if that role is in use |

---

## 10. Comparison: `profiles_rls_tighten.sql` vs live/effective schema

| Item | Tighten file | Live/effective (this probe) |
|------|----------------|------------------------------|
| Drop broad `profiles_authenticated_read` | Yes | **Behavior shows broad read still present** |
| Self / admin / mentor / student-mentor / employee-manager SELECTs | Defined | **Cannot confirm names via API**; behavior ≠ tighten-only |
| Student sees only self (+ mentor) | Yes | **No** — sees 35 rows / all roles |
| Admin full read via `is_admin()` | Yes | Admin sees all (also via broad policy today) |

---

## 11. STOP — approval required

**No fix has been applied.**

Please:

1. Run the **read-only catalog SQL** in §3.3 and confirm the live policy name(s).  
2. Explicitly approve applying **`profiles_rls_tighten.sql`** (or a trimmed DROP of the confirmed broad policy + ensure scoped policies).  

Only after your approval should any SQL be executed.
