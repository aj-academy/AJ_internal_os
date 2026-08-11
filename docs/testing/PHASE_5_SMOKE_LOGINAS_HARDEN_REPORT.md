# AJ OS — Phase 5 Smoke (loginAs harden) — Single Run

**Date:** 11 August 2026  
**Base URL:** `http://localhost:3000` only  
**Run type:** Single execution — `--retries=0`, no re-runs  
**Application / DB / Supabase / RLS / middleware / auth logic:** unchanged  

**Test-only change:** `e2e/helpers/login.ts` (`loginAs`)  
- Label-based selectors (`getByLabel` Role / Email / Password; Sign in by role name)  
- Fill order: email → password → role  
- Pre-submit checks: email equals expected, password non-empty, role equals requested  
- On check failure: throw `Harness error: …` (password / tokens / storage-state never logged)  

**Command:** `npx playwright test e2e/auth.setup.ts e2e/smoke --reporter=list --retries=0`  

---

## Summary

| Result | Count |
|--------|------:|
| **Pass** | **23** |
| **Fail** | 0 |
| **Skipped** | 0 |
| **Did not run** | 0 |
| **Total** | 23 |

**Duration:** ~2.5 minutes · **Exit code:** 0  

---

## Pass (23)

### Setup (3)
- authenticate as admin  
- authenticate as mentor  
- authenticate as student  

### Login smoke (2)
- login page loads  
- incorrect login is rejected  

### Admin smoke (4)
- admin session reaches admin area  
- admin dashboard opens  
- academic page opens  
- student management page opens  

### Mentor smoke (5)
- mentor session reaches mentor area  
- mentor dashboard opens  
- assigned students page opens  
- assignment page opens  
- test page opens  

### Student smoke (6)
- student session reaches student area  
- student dashboard opens  
- assignment page opens  
- test page opens  
- material page opens  
- queries page opens  

### Authorization smoke (3)
- student cannot open admin URL  
- student cannot open mentor URL  
- mentor cannot open unauthorized admin URL  

---

## Fail / Skipped / Did not run

None.

---

## Defect classification

| Category | Count | Notes |
|----------|------:|-------|
| **Confirmed application defects** | 0 | — |
| **Harness failures** | 0 | Pre-submit checks passed; no `Harness error` thrown |
| **Environment / auth rate-limit failures** | 0 | Three role logins in setup succeeded |

---

## Conclusion

**Clean Phase 5 smoke pass on localhost (23/23).**  
Ready to consider Phase 6 only when you explicitly approve; not started here.

Log: `AJ_Academy_OS/test-results/phase5-loginAs-harden-run.txt`  

---

## STOP

No further runs. No application changes. No load testing.
