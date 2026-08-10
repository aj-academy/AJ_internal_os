# AJ OS — Phase 5 Smoke Test Report

**Date:** 10 August 2026  
**Base URL:** `http://localhost:3000` only  
**Command:** `npx playwright test e2e/smoke --reporter=list`  
**Users created:** No  
**Production data modified:** No  
**Emails / notifications sent by agent:** No  

---

## Summary

| Result | Count |
|--------|------:|
| **Pass** | 5 |
| **Fail** | 17 |
| **Skipped** | 0 |
| **Total** | 22 |

Duration: ~11.6 minutes · Exit code: 1

---

## Pass

| Test | Status |
|------|--------|
| Admin smoke › login page loads | Pass |
| Admin smoke › incorrect login is rejected | Pass |
| Admin smoke › correct admin login reaches admin area | Pass |
| Mentor smoke › login page loads | Pass |
| Student smoke › login page loads | Pass |

---

## Fail

| Test | Status | Likely cause (observation only) |
|------|--------|----------------------------------|
| Admin smoke › admin dashboard opens | Fail | `page.goto` → `net::ERR_ABORTED` on `/admin/dashboard` after login |
| Admin smoke › academic page opens | Fail | Same pattern on `/admin/academic/overview` |
| Admin smoke › student management page opens | Fail | Same pattern on `/admin/students/directory` |
| Authorization smoke › student cannot open admin URL | Fail | Student login never left `/login` (45s timeout) |
| Authorization smoke › student cannot open mentor URL | Fail | Same |
| Authorization smoke › mentor cannot open unauthorized admin URL | Fail | Mentor login never left `/login` |
| Mentor smoke › mentor login reaches mentor area | Fail | Stayed on `/login`; UI showed role mismatch |
| Mentor smoke › mentor dashboard opens | Fail | Same (login blocked) |
| Mentor smoke › assigned students page opens | Fail | Same |
| Mentor smoke › assignment page opens | Fail | Same |
| Mentor smoke › test page opens | Fail | Same |
| Student smoke › student login reaches student area | Fail | Stayed on `/login` |
| Student smoke › student dashboard opens | Fail | Same |
| Student smoke › assignment page opens | Fail | Same |
| Student smoke › test page opens | Fail | Same |
| Student smoke › material page opens | Fail | Same |
| Student smoke › queries page opens | Fail | Same |

---

## Skipped

None (all credential env vars were present).

---

## Important finding (do not treat as a fix yet)

The login page has a **Role** dropdown (`#login-role`) that **defaults to Admin**.

Smoke tests filled email/password but **did not select Mentor or Student** before Sign in.

For mentor/student runs, the page stayed on `/login` with a message like **“Selected role does not match your account access.”**

Admin “reaches admin area” passed because the default role is Admin.

**Suggested next fix (needs your approval):** update Playwright helpers to `selectOption` the correct role before clicking Sign in. That is a **test script** change, not an app security change.

Admin follow-on navigations (`ERR_ABORTED`) may be a separate redirect/session issue; investigate after role selection is fixed.

---

## Environment notes

- Credentials were found in `Untitled` (`.env.e2e` was empty); content was copied into `.env.e2e` for the run. Prefer saving directly to `.env.e2e` next time.
- Screenshots live under `AJ_Academy_OS/test-results/` (gitignored).

---

## Phase 5 STOP

No further phases started. No automatic bug fixes applied.
