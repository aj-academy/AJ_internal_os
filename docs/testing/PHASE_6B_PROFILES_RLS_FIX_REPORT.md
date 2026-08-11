# Phase 6B — Profiles RLS Fix Report (updated after 6B.1)

**Date:** 11 August 2026  
**Final status:** **SUCCESS** (after correcting live policy name)  
**App project:** `urgqnaxzeffgwfnlbixv.supabase.co` / `aj-academy`  

---

## Clarification: `permissive = true`

Every policy showing **`permissive = true` is normal** in Postgres. That column is **not** the security bug.

The bug was only when **`using_expression = true`** (always allow). That row is now gone.

---

## What was wrong initially

| Attempt | Result |
|---------|--------|
| 6B apply (`profiles_authenticated_read`) | SQL “success” but **wrong policy name** — leak remained |
| Live catalog | Broad policy named **`Authenticated users can read profiles`** with `USING (true)` |
| 6B.1 | Dropped that exact name + ensured scoped selects |

---

## SQL applied (effective)

1. `AJ_Academy_SB/phase6b_profiles_rls_tighten_apply.sql` (helpers + scoped policies; did not remove live broad name)
2. `AJ_Academy_SB/phase6b1_drop_broad_profiles_read.sql` — **dropped** `"Authenticated users can read profiles"`

### Policies after (from your SQL Editor + expected)

SELECT policies are scoped (`is_admin()`, mentor scope, `profiles_select_own`, employee CRM/manager, etc.).  
**No SELECT policy with `using_expression = true`.**

INSERT `profiles_insert_own` left in place (untouched intent).

---

## Test results (post-fix-b1)

### Direct RLS / API probes (`phase6b-verify-profiles-rls.mjs`)

| Check | Result | Evidence |
|-------|--------|----------|
| Student own profile | **PASS** | rows=1 |
| Student other profile | **PASS** | rows=0 |
| Student broad list | **PASS** | total=2 (self + mentor only); otherStudents=0 |
| Mentor own | **PASS** | rows=1 |
| Mentor assigned student | **PASS** | rows=1 |
| Admin directory SELECT | **PASS** | 20 students |
| Admin API directory | **PASS** | HTTP 200 |
| Anon | **PASS** | rows=0 |

Student visibility probe: `rows_returned=2`, roles `mentor`+`student` only (`LIKELY_TIGHTENED_OR_NARROW`).  
Debug log: `debug-4cd1ad.log` `runId=post-fix-b1`.

### Before → after (Student)

| Metric | Before | After |
|--------|-------:|------:|
| Profile rows visible | 35 | **2** |
| Other students | 20 | **0** |
| Admins visible | 4 | **0** |

### Phase 5 smoke + Phase 6 authz

| Suite | Result |
|-------|--------|
| Auth setup (3) | PASS |
| Phase 5 smoke | **PASS** |
| Phase 6 student (incl. STU-RLS-PROFILE) | **PASS** |
| Phase 6 mentor / admin | **PASS** (1 skipped: no out-of-scope student data) |
| **Total** | **42 passed, 1 skipped, 0 failed** |

---

## Rollback SQL (emergency only — do not run)

Recreates the leak:

```sql
begin;
drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles"
on public.profiles
for select
to authenticated
using (true);
commit;
```

Also: `AJ_Academy_SB/phase6b_profiles_rls_tighten_rollback.sql` (legacy name).

---

## Regressions

None observed in smoke / Phase 6 / directory API after 6B.1.

---

## STOP

Fix verified with runtime probes + Playwright. Confirm in chat if the app still looks good for Admin/Mentor/Student manual spot-check; instrumentation can then be removed.
