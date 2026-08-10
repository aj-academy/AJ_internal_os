# AJ OS — Staging Setup Guide (required before load tests)

**Why this exists:** You asked for 5–200 user load tests. Those must **not** run against your live AJ OS / live Supabase project. This guide explains how to create a safe staging environment first.

---

## What is staging?

A **copy of AJ OS for testing only**, with:

- A **separate Supabase project** (different URL and keys)
- Test-only users (fake emails)
- Test-only departments / courses / batches / students
- Email sending disabled or pointed at a catch-all test inbox
- Firebase push disabled or using a test Firebase project
- A Vercel (or local) deploy that uses **only** staging env vars

If staging is missing, treat every automated write/load test as **HIGH RISK**.

---

## Checklist — do you already have staging?

Answer yes/no:

1. Do you have a second Supabase project (not the live one)?  
2. Does it have a different `NEXT_PUBLIC_SUPABASE_URL`?  
3. Are there **no real students** in that project?  
4. Can you turn off Zoho/Resend/FCM or use test credentials?  
5. Is there a URL like `aj-academy-staging.vercel.app` (example name only)?

If any answer is **no** or **unsure** → you do **not** have staging yet.

---

## How to create staging (high level)

### A. Create a new Supabase project

1. In Supabase dashboard → New project (e.g. `aj-os-staging`).  
2. Save the new Project URL, anon key, and service role key in a **password manager** — not in git.  
3. Apply SQL from `AJ_Academy_SB/DATABASE_SETUP_ORDER.txt` **on the staging project only**.  
4. Create a few test Auth users manually (1 admin, 1 mentor, 2 students) with obvious fake emails like `qa.admin+staging@example.com`.

### B. Create a staging app environment

1. Vercel: new Preview/Staging env, **or** local `.env.staging.local` (never commit).  
2. Set:
   - `NEXT_PUBLIC_SUPABASE_URL` = staging URL  
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = staging anon  
   - `SUPABASE_SERVICE_ROLE_KEY` = staging service role  
3. Leave production SMTP/FCM empty on staging, or use clearly test credentials.  
4. Confirm in the UI that login only shows test users.

### C. Safety flag for future load tests

When load scripts are added later, they must require:

```text
LOAD_TEST_BASE_URL=<staging app URL>
```

And must **abort** if that URL equals production (e.g. `aj-academy.vercel.app`) or if the variable is missing.

---

## What I will do after you confirm staging

Only after you reply with something like:

> “Staging is ready. Base URL is … Supabase is the staging project …”

I can then (with your approval, step by step):

1. Prepare k6 scripts under `tests/load/` (no execution yet), **or** install k6 after you approve.  
2. Run **Level 1 = 5 users** only.  
3. Stop and report.  
4. Ask before 20 → 50 → 100 → 200.

---

## What I will never do without approval

- Run load tests against production  
- Create hundreds of Auth users on the live project  
- Send real emails / FCM to real users  
- Delete or truncate production tables  

---

## Your next message should pick one

**Option A — Staging not ready**  
Reply: `Continue Phase 3 test plan only`  

**Option B — Staging ready**  
Reply with:
- Staging app URL  
- Confirmation it is **not** production  
- Approval to prepare (not yet run) load scripts  

**Option C — Lint cleanup**  
Reply: `Approve limited lint fixes only` (unused vars / prefer-const; no architecture changes)
