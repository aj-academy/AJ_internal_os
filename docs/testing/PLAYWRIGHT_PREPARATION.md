# AJ OS — Phase 4 Playwright Preparation

**Date:** 10 August 2026  
**Status:** **INSTALLED** (10 Aug 2026) — package + Chromium + smoke stubs  
**Tests run?** **No** (per approval: install only)  
**Playwright in repo?** **Yes** (`@playwright/test`)

---

## Are we testing or only auditing?

| Phase | What happened | Testing or auditing? |
|-------|---------------|----------------------|
| Phase 1 | Read code, wrote audit | **Auditing only** |
| Phase 2 | `lint` + `build` | **Code health check** (not user/feature testing) |
| Phase 3 | Wrote of manual test cases | **Test planning** (not executed by the agent) |
| Phase 4 (now) | Explain Playwright install | **Still preparation** |
| Phase 5+ | Automated browser smokes | **Real testing** (needs install + accounts + preferably staging) |
| Load 5–200 | k6 concurrency | **Load testing** (blocked until staging) |

**Short answer:** Right now we are still mostly **auditing and preparing**.  
We have **not** run browser tests against Admin/Mentor/Student logins yet.  
Phase 2 only proved the app **builds**; it did not prove features work for users.

---

## Why Playwright is useful for AJ OS

Playwright opens a real browser and can:

- Open `/login`, try correct/wrong passwords  
- Check Admin / Mentor / Student dashboards load  
- Confirm a Student **cannot** open `/admin/...`  
- Repeat the same checks after code changes (regression safety)

It does **not** replace load testing (that is k6 later).  
It does **not** need to write database data if we keep tests as **smoke / read-only**.

---

## What would be installed (only after you approve)

| Item | Detail |
|------|--------|
| Package | `@playwright/test` (devDependency) |
| Browsers | Chromium (recommended first); optional Firefox/WebKit later |
| Install command (approx.) | `npm init playwright@latest` **or** `npm i -D @playwright/test` then `npx playwright install chromium` |
| Where | Inside `AJ_Academy_OS/` |

### Approximate impact

| Area | Impact |
|------|--------|
| Production database | **None** from install itself |
| Real users | **None** from install itself |
| `package.json` / `package-lock.json` | Will change |
| Disk space | Browser binaries ~100–300+ MB for Chromium |
| CI / Vercel production | Unaffected unless you wire CI later |
| Risk of install | **Low** |

---

## Files that would be created (proposed)

After approval, typical layout:

```text
AJ_Academy_OS/
  playwright.config.ts
  e2e/
    smoke/
      admin.smoke.spec.ts
      mentor.smoke.spec.ts
      student.smoke.spec.ts
      authz.smoke.spec.ts
  .env.e2e.example          # placeholders only — never commit real passwords
```

Also add npm scripts such as:

- `test:e2e` → `playwright test`
- `test:e2e:smoke` → smoke folder only

Config safety:

- `baseURL` from `E2E_BASE_URL` (not hardcoded production)  
- If `E2E_BASE_URL` missing → tests abort  
- Credentials from env: `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, etc.  
- Default: **no** account creation; use accounts you provide  

---

## Accounts needed later (Phase 5) — max

| Role | Count | Rule |
|------|-------|------|
| Admin | 1 | Must be a **test** account you confirm |
| Mentor | 1 | Test account |
| Student | 2 | Test accounts |

The agent will **not** create these automatically unless you confirm they are test accounts and (preferably) on staging.

---

## Approval gate (required)

### ACTION
Install Playwright (`@playwright/test` + Chromium) in `AJ_Academy_OS`, add config + empty/smoke file stubs.

### WHY
Needed for Phase 5 automated browser smoke tests.

### RISK
**Low** for install. Running tests against production login is **CAUTION** (use staging when possible).

### DATABASE IMPACT
**None** from install. Smoke logins later only create sessions (no intentional data writes).

### PRODUCTION IMPACT
None from install. Running e2e against live URL needs your OK.

### REQUIRES APPROVAL
**Yes — reply clearly before anything is installed.**

Suggested reply:

```text
Approve Playwright install
E2E_BASE_URL=http://localhost:3000
(or your staging URL)
```

Or:

```text
Approve Playwright install only — do not run tests yet
```

---

## Phase 4 STOP

Nothing was installed.  
No browsers downloaded.  
No e2e tests executed.

Awaiting your approval to install.
