# AJ OS — Phase 5 Single Smoke Run Report

**Date:** 10 August 2026  
**Base URL:** `http://localhost:3000` only  
**Run type:** Single execution — no retries, no re-runs  
**Command:** `npx playwright test e2e/smoke --reporter=list`  
**Retries:** 0 (local config)  
**Artifacts:** Screenshots on failure only (`test-results/`); traces not captured (trace = on-first-retry, no retries)  

---

## Summary

| Result | Count |
|--------|------:|
| **Pass** | 5 |
| **Fail** | 17 |
| **Skipped** | 0 |
| **Total** | 22 |

**Duration:** ~14.3 minutes · **Exit code:** 1

---

## Pass

| # | Test |
|---|------|
| 1 | Admin smoke › login page loads |
| 2 | Admin smoke › incorrect login is rejected |
| 3 | Admin smoke › correct admin login reaches admin area |
| 10 | Mentor smoke › login page loads |
| 16 | Student smoke › login page loads |

---

## Fail (by category)

### Environment / auth rate-limit issue (13)

Repeated logins in one serial suite (~22 attempts). After **one successful admin login** (test 3), later tests overwhelmingly fail with **45s timeout on `/login`**.

| Test | Last URL / symptom |
|------|-------------------|
| Admin › admin dashboard opens | `/login` — empty email/password, *missing email or phone* |
| Admin › academic page opens | `/login` timeout |
| Admin › student management page opens | `/login` timeout |
| Authz › student cannot open admin URL | `/login` timeout |
| Authz › student cannot open mentor URL | `/login` timeout |
| Authz › mentor cannot open unauthorized admin URL | `/login` timeout |
| Mentor › mentor login reaches mentor area | `/login` timeout |
| Mentor › mentor dashboard opens | `/login` timeout |
| Mentor › assigned students page opens | `/login` timeout |
| Mentor › test page opens | `/login` timeout |
| Student › student login reaches student area | `/login` timeout (after role mismatch attempt) |
| Student › student dashboard opens | `/login` timeout |
| Student › assignment / test / material / queries pages | `/login` timeout |

**Assessment:** Smoke is **not yet repeatable** in a single 22-test pass because login succeeds once then degrades. Likely Supabase/auth throttling or session churn from rapid sequential sign-ins. **Not suitable for Phase 6 or load testing yet.**

---

### Test harness issue (3)

| Test | Symptom | Notes |
|------|---------|-------|
| Mentor › assignment page opens | Empty URL after navigation | Page/browser unstable during redirect (6.7s fail) |
| Student › student login reaches student area | Role **Admin** still selected while student email filled; *Selected role does not match* | Role dropdown did not stay on **Student** before submit in this run |
| (Related) Several authz failures | Same role-mismatch pattern when login partially executed | Harness did not reliably apply role before Sign in under load |

**Assessment:** Role-by-label selection works when auth is healthy (see passing admin login). Under failure conditions, form state is inconsistent. Suite design (22 fresh logins, 1 worker) amplifies flakiness.

---

### Confirmed application defect (0)

**None confirmed in this run.**

- No evidence of unauthorized access (authz never reached post-login navigation).
- Login rejection messages (*missing email*, *role does not match*) match **expected app behavior** when credentials/role are wrong or empty — in these cases the harness/env did not complete a valid login.

---

### Inconclusive (1)

| Test | Reason |
|------|--------|
| Mentor › assignment page opens | May be harness (empty URL) **or** environment crash; login step unclear in 6.7s window |

All **authorization smoke** tests are **inconclusive** — could not establish stable student/mentor sessions to verify redirect-away from forbidden URLs.

---

## Skipped

None.

---

## Conclusion

| Question | Answer |
|----------|--------|
| Is Phase 5 smoke stable? | **No** — 5/22 pass on this single run |
| Primary blocker | **Environment/auth rate-limit** after first successful login |
| Secondary blocker | **Test harness** — 22 sequential logins + occasional role-select flake |
| Ready for Phase 6 / load tests? | **No** — would produce misleading results |
| Application defects found? | **None confirmed** |

### Recommended before next run (no action taken)

1. Split smoke into **3 projects** (admin / mentor / student) with **1 login each**, or use Playwright `storageState` after one login per role.  
2. Re-run **once** after auth cooldown (30+ minutes) or against a **staging Supabase** with higher auth limits.  
3. Manually confirm each QA account logs in with the correct Role in the browser.

---

## STOP

No application, database, Supabase, RLS, middleware, or auth changes made.  
No auto-fixes applied.

Artifacts: `AJ_Academy_OS/test-results/` (failure screenshots), full log: `AJ_Academy_OS/test-results/phase5-single-run.txt`
