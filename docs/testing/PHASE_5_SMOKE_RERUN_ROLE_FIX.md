# AJ OS — Phase 5 Smoke Re-run (after Role select fix)

**Date:** 10 August 2026  
**Base URL:** `http://localhost:3000` only  
**Change:** Test-only — select `#login-role` (Admin / Mentor / Student) before Sign in  
**App / DB / Supabase / RLS / users:** Not modified  

---

## Summary

| Result | Count |
|--------|------:|
| **Pass** | 7 |
| **Fail** | 15 |
| **Skipped** | 0 |
| **Total** | 22 |

Compared to previous run (5 Pass / 17 Fail): **+2 Pass** — mentor and student login now succeed.

---

## Pass

| Test | Status |
|------|--------|
| Admin smoke › login page loads | Pass |
| Admin smoke › incorrect login is rejected | Pass |
| Admin smoke › correct admin login reaches admin area | Pass |
| Mentor smoke › login page loads | Pass |
| Mentor smoke › mentor login reaches mentor area | Pass |
| Student smoke › login page loads | Pass |
| Student smoke › student login reaches student area | Pass |

---

## Fail

All remaining failures share the same Playwright error after a successful role login:

`page.goto: net::ERR_ABORTED` while opening a second URL.

| Test | Status |
|------|--------|
| Admin smoke › admin dashboard opens | Fail |
| Admin smoke › academic page opens | Fail |
| Admin smoke › student management page opens | Fail |
| Authorization smoke › student cannot open admin URL | Fail |
| Authorization smoke › student cannot open mentor URL | Fail |
| Authorization smoke › mentor cannot open unauthorized admin URL | Fail |
| Mentor smoke › mentor dashboard opens | Fail |
| Mentor smoke › assigned students page opens | Fail |
| Mentor smoke › assignment page opens | Fail |
| Mentor smoke › test page opens | Fail |
| Student smoke › student dashboard opens | Fail |
| Student smoke › assignment page opens | Fail |
| Student smoke › test page opens | Fail |
| Student smoke › material page opens | Fail |
| Student smoke › queries page opens | Fail |

---

## Classification of remaining failures (no auto-fix)

| Classification | Detail |
|----------------|--------|
| **Likely test-script / harness** | Playwright `page.goto()` throws `net::ERR_ABORTED` when Next.js performs an immediate server redirect (common with `requireRole` / layout redirects). Authz cases may be **false negatives**: redirect away from forbidden URLs is expected app behaviour, but the aborted navigation fails the test before the assertion runs. |
| **Not proven application defect** | Login-with-correct-role now works for Admin, Mentor, and Student. No evidence yet that dashboards are broken for real users in a browser. |
| **Not fixed in this step** | Per instructions: remaining items reported only; no further test or app changes applied. |

Possible later **test-only** follow-up (needs approval): use safer navigation (`waitUntil: 'domcontentloaded'`, catch redirect, or assert final URL after `goto` with redirect handling).

---

## Skipped

None.

---

## STOP

Phase 5 re-run finished. No application code changes. No DB/user changes.
