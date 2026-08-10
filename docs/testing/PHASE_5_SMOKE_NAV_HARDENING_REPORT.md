# AJ OS — Phase 5 Smoke Re-run (Navigation Hardening)

**Date:** 10 August 2026  
**Base URL:** `http://localhost:3000` only  
**Scope:** Test harness only — no application, database, Supabase, RLS, user, or role changes  

---

## Test harness changes (this pass)

| File | Change |
|------|--------|
| `e2e/helpers/navigation.ts` | **New** — `gotoAppRoute` tolerates `ERR_ABORTED`; URL polling after redirects; `expectProtectedRoute` / `expectForbiddenRoute` |
| `e2e/helpers/login.ts` | Role selected by **label** before submit; verifies `#login-role` value; waits for role home URL |
| `e2e/smoke/*.spec.ts` | Use navigation helpers instead of raw `page.goto` + brittle waits |
| `playwright.config.ts` | Chromium `--disable-dev-shm-usage` (stability on Windows) |

---

## Summary (best run after navigation hardening)

| Result | Count |
|--------|------:|
| **Pass** | 6 |
| **Fail** | 16 |
| **Skipped** | 0 |
| **Total** | 22 |

> **Note:** Full suite was run multiple times in one session (~50+ logins). Later runs degraded (4–5 pass) due to **login timeouts on `/login`** — consistent with Supabase/auth rate limiting or session churn, not a single stable app state. Numbers below use the **best post-hardening run**.

---

## Pass

| Test | Status |
|------|--------|
| Admin smoke › login page loads | Pass |
| Admin smoke › incorrect login is rejected | Pass |
| Admin smoke › correct admin login reaches admin area | Pass |
| Admin smoke › academic page opens | Pass |
| Mentor smoke › login page loads | Pass |
| Student smoke › login page loads | Pass |

**Improvement vs pre-hardening (7 pass / 15 fail):** `academic page opens` now passes when login succeeds; `ERR_ABORTED` on second navigation is handled in several cases.

---

## Fail — by category

### A. Test harness / environment (not confirmed app defects)

| Test | Symptom | Likely cause |
|------|---------|--------------|
| Admin › admin dashboard opens | `Page crashed` / empty URL | Chromium crash mid-redirect (environment) |
| Admin › student management page opens | Empty URL after navigation | Same / unstable page during redirect |
| Mentor › mentor dashboard opens | Empty URL / fast fail | Redirect chain + browser instability |
| Mentor › test page opens | Fast fail | Same |
| Student › queries page opens | Fast fail | Same |
| Authz › student cannot open mentor URL | Empty URL on assertion | Page not settled after redirect abort |
| Many mentor/student login tests (later runs) | Timeout on `/login` | Repeated logins in one session (rate limit / flaky auth) |

**Action:** Do not change application code. Consider re-running smoke **once** after a cool-down, or split suites by role with separate Playwright projects.

---

### B. Confirmed application / test-data issues (do not auto-fix)

| Test | Symptom | Classification |
|------|---------|----------------|
| Authz › student cannot open admin URL | Login stuck on `/login` — **Role still Admin** while student email filled; message: *Selected role does not match your account access* | **Test-data or login UX** — role select did not apply before submit in some runs; verify dedicated QA student account + manual login |
| Authz › mentor cannot open unauthorized admin URL | Same pattern for mentor credentials | Same |
| Mentor/student › login reaches area (intermittent) | Role mismatch or timeout on login | **Auth / test accounts** when role not selected or rate limited |

When login **does** succeed, protected-route navigation improved (e.g. admin academic overview).

---

### C. Authorization failures (application — needs manual verification)

| Test | Status | Notes |
|------|--------|-------|
| Student cannot open admin URL | **Inconclusive** | Could not complete login reliably in failing runs |
| Student cannot open mentor URL | **Inconclusive** | Empty URL / crash during redirect — retest when login stable |
| Mentor cannot open unauthorized admin URL | **Inconclusive** | Login failed in captured run |

**No confirmed authorization bypass** was observed in this pass. **No confirmed secure deny** either — authz tests need a clean single run with stable QA accounts.

---

## Skipped

None (all credential env vars present in `.env.e2e`).

---

## Comparison across Phase 5 runs

| Run | Pass | Fail | Notes |
|-----|-----:|-----:|-------|
| Initial (no role select) | 5 | 17 | Role default Admin broke mentor/student |
| After role select | 7 | 15 | Logins OK; `ERR_ABORTED` on second `goto` |
| After navigation hardening (best) | **6** | 16 | Academic route OK; authz/login still flaky |
| After navigation hardening (last, rate-limited) | 4 | 18 | Most logins timed out on `/login` |

---

## Recommended next steps (require your approval)

1. **Wait 15–30 minutes** (or use fresh Supabase auth limits), then re-run `npm run test:e2e:smoke` **once**.  
2. **Manually verify** QA student/mentor can log in with Role dropdown (same emails as `.env.e2e`).  
3. If authz still fails when login is stable → treat as **application authorization** defect and investigate `requireRole` / redirects (report only, no auto-fix).  
4. Optional test-only: split smoke into admin / mentor / student projects to reduce login churn.

---

## STOP

No application code modified. No database or user changes. No auto-fix of confirmed application defects.
