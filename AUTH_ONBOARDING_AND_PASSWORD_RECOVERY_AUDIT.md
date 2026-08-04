# AUTH Onboarding & Password Recovery Audit (AJ OS)

Date: 2026-08-04  
Scope: `AJ_Academy_OS` + `AJ_Academy_SB`  
Auditor role: Senior Authentication Architect / Supabase Auth Specialist

---

## Executive Summary

AJ OS already has a working Supabase sign-in path and basic forgot/reset pages, but the current onboarding model is **not production-safe** for secure invitations:

- New user creation currently uses `auth.admin.createUser` with caller-provided password in app APIs.
- A custom `first-login` bootstrap endpoint accepts password and writes it server-side through service role.
- No true Supabase invite flow (`inviteUserByEmail`) is implemented.
- No `/auth/set-password` flow exists for first-time activation.
- No durable auth lifecycle audit trail exists for invitation/recovery states.

Current state supports authentication basics, but does **not** satisfy enterprise onboarding/recovery acceptance criteria yet.

---

## Phase 1 Findings (Current Implementation)

## 1) Supabase clients and separation

### Working
- Browser client exists: `AJ_Academy_OS/lib/supabase/client.ts`
- Server client exists: `AJ_Academy_OS/lib/supabase/server.ts`
- Service-role client exists: `AJ_Academy_OS/lib/supabase/admin.ts`
- Service key is not used in browser code paths reviewed.

### Risks / Gaps
- `createAdminClient()` is imported in multiple operational routes; policy relies on developer discipline.
- No explicit architectural guardrail preventing accidental client import beyond comments.

---

## 2) Login, callback, and role routing

### Working
- Login UI: `AJ_Academy_OS/app/login/page.tsx` + `components/auth/LoginForm.tsx`
- Server sign-in API: `AJ_Academy_OS/app/api/auth/sign-in/route.ts` using `signInWithPassword`
- Callback route: `AJ_Academy_OS/app/auth/callback/route.ts` using `exchangeCodeForSession`
- Safe relative redirect helper exists: `lib/security/safeRedirect.ts`
- Role-based redirect map exists: `lib/auth/roleRedirect.ts`

### Risks / Gaps
- `sign-in` API role whitelist omits `employee` while UI allows employee role selection (`LOGIN_ROLES` mismatch).
- Login form includes client-side fallback flow invoking `/api/auth/needs-first-login` and `/api/auth/first-login`; this is an anti-pattern for invite onboarding.
- Middleware is pass-through only (`AJ_Academy_OS/middleware.ts`), so no refresh/flow-level auth hardening there.

---

## 3) Forgot/reset password

### Working
- Forgot page exists: `AJ_Academy_OS/app/forgot-password/page.tsx`
- Reset page exists: `AJ_Academy_OS/app/reset-password/page.tsx`
- Uses `resetPasswordForEmail`, `exchangeCodeForSession`, and `updateUser`.

### Risks / Gaps
- Forgot password currently shows raw provider errors; response is not consistently neutral (enumeration-hardening incomplete).
- Route is `/reset-password`, while target architecture requires `/auth/reset-password`.
- No `/auth/set-password` page for invitation-first setup.
- No structured expired/used/disabled account UX states with support-safe messaging standard.

---

## 4) User creation flows (admin + imports)

### Working
- Admin user creation endpoint exists: `AJ_Academy_OS/app/api/admin/employees/route.ts`
- Student import creates auth+profile: `AJ_Academy_OS/lib/students/importExecute.ts`
- Super-admin guard exists for creating super_admin users.

### Risks / Gaps (Critical)
- `admin/employees` accepts plaintext password from request body and calls `auth.admin.createUser({ password })`.
- Student import generates temporary passwords (`generateTempPassword`) and creates auth users with those credentials.
- `/api/auth/first-login` allows password bootstrap by email/role from public-facing route (rate-limited, but still wrong trust boundary for secure invite model).
- No idempotent invite orchestration state machine (pending/sent/accepted/failed/expired).
- No centralized transaction/reconciliation layer for auth-user/profile partial failures across all roles.

---

## 5) Account/profile model

### Current schema (relevant)
- Base profile table: `AJ_Academy_SB/schema.sql` (`public.profiles`)
- Current fields include: `id`, `full_name`, `email`, `role`, `department`, `designation`, `status`, `created_at`
- Additional student fields exist via `student_portal_profile_fields.sql`

### Gap to required model
Missing/unstable account lifecycle fields in `profiles`:
- `auth_user_id` (currently overloaded as `id = auth.users.id`; workable but should be explicit or clearly standardized)
- `account_status` richer enum
- `invitation_status`
- `invitation_sent_at`
- `invitation_accepted_at`
- `first_login_completed`
- `password_setup_completed`
- `activated_at`
- `deactivated_at`
- `last_login_at`
- `created_by`, `updated_at` consistency for identity lifecycle

---

## 6) Email delivery and templates

### Existing
- Outreach mail service exists using Nodemailer: `AJ_Academy_OS/lib/email/outreachEmail.ts`
- Zoho SMTP envs are documented and supported for outreach mail.
- Supabase setup guide includes auth URL section and SMTP env variables.

### Gaps
- No dedicated auth invitation template implementation in app code (expected in Supabase Auth template config).
- No dedicated password-change confirmation mail workflow.
- No invite resend/cancel management email workflow.
- No explicit evidence of configured Supabase invite/recovery template branding in repository (dashboard-configured, not codified).

---

## 7) RLS / authorization posture for auth lifecycle

### Existing
- Profiles RLS scripts exist (`profiles_rls_fix.sql`, `profiles_rls_tighten.sql`, `security_rls_access_fix.sql`).
- API role gating wrappers exist (`verifySessionRole`, `requireAdminApiSession`).

### Gaps
- No dedicated RLS/policy segmentation for invitation lifecycle visibility and management states.
- No explicit policy coverage for “admin can manage invitation states while users cannot inspect others”.

---

## 8) Audit logging

### Existing
- Console security logging exists: `lib/security/auditLog.ts` (`logSecurityEvent`).
- Durable `audit_logs` table exists and is used in some HR/student import flows (`lib/hr/auditLog.ts`).

### Gaps
- Auth lifecycle events are mostly console-level, not uniformly persisted in DB.
- No dedicated auth audit event taxonomy covering invite sent/accepted/resend/reset completed/account repair.
- Sensitive-event logging policy not centrally enforced for all auth endpoints.

---

## 9) Duplicate user and partial-failure handling

### Existing
- Basic duplicate handling in student import and admin creation.
- Some rollback calls exist (`admin.auth.admin.deleteUser`) on profile write failure.

### Gaps
- No consistent reconciliation workflow:
  - auth user exists, profile missing
  - profile exists, auth missing
  - invite send failure after profile create
- No admin “Repair User Account” command flow.
- No admin “Resend Invitation” with cooldown and structured status.

---

## Security Gap Analysis (Priority)

### Critical (P0)
1. Plaintext password accepted in admin user create API payload.
2. Temporary/generated passwords created for student import accounts.
3. Custom first-login password bootstrap endpoint (`/api/auth/first-login`) bypasses invitation-first trust model.
4. Missing invitation status lifecycle model and secure set-password route.

### High (P1)
1. Forgot-password UX may expose provider error details (enumeration risk).
2. No durable auth audit trail for all lifecycle stages.
3. Redirect config/routing not aligned to required `/auth/set-password` and `/auth/reset-password` structure.

### Medium (P2)
1. Login role whitelist mismatch (`employee` missing in sign-in API constant).
2. In-memory rate limiting only (single-instance; non-distributed).
3. Middleware is passthrough, reducing centralized auth hardening opportunities.

---

## Existing Features Reused

- Supabase SSR client architecture (`client.ts`, `server.ts`, `route-handler.ts`)
- Service-role admin client (`lib/supabase/admin.ts`) on server routes
- Role redirect map (`lib/auth/roleRedirect.ts`)
- Safe redirect validator (`lib/security/safeRedirect.ts`)
- Existing admin/student role gating wrappers (`lib/security/auth/*`)
- Existing `audit_logs` table + write utility (`lib/hr/auditLog.ts`)
- Existing Zoho SMTP configuration patterns (`lib/email/outreachEmail.ts`, setup guide)

---

## UI-only or Partially Implemented Features

- Forgot/reset pages exist but are not yet aligned to full secure onboarding lifecycle.
- No true invitation management UI (pending/accepted/expired/failed, resend, repair).
- No `/auth/set-password` first-time setup UX.
- No admin account-management dashboard for auth linkage health.

---

## Required Migrations (Planned)

Create a migration set (new SQL) to extend identity lifecycle fields safely:

1. `profiles` lifecycle columns:
   - `invitation_status text`
   - `invitation_sent_at timestamptz`
   - `invitation_accepted_at timestamptz`
   - `first_login_completed boolean default false`
   - `password_setup_completed boolean default false`
   - `activated_at timestamptz`
   - `deactivated_at timestamptz`
   - `last_login_at timestamptz`
   - `account_status text` (or evolve existing `status` to richer enum)
2. Optional explicit linkage:
   - `auth_user_id uuid unique` (if decoupling from `id`); otherwise formally standardize `profiles.id = auth.users.id`.
3. Auth lifecycle audit table (or extend `audit_logs` taxonomy) for invitation/reset events.
4. RLS updates:
   - self-read/self-limited update
   - admin invitation management
   - prevent role/status self-escalation.

---

## Required Code Changes (Planned)

1. Replace create-password onboarding with invite-first onboarding:
   - use `auth.admin.inviteUserByEmail(...)` from protected server route only.
2. Remove password from admin create-user payloads and student import account provisioning.
3. Remove/retire `/api/auth/first-login` bootstrap path.
4. Add `/auth/set-password` page for invitation activation.
5. Move reset route to `/auth/reset-password` (or add secure compatibility redirect).
6. Harden `/forgot-password` to neutral response behavior.
7. Extend callback flow to route by auth intent and safe redirects.
8. Add invitation management APIs:
   - resend
   - cancel/deactivate
   - repair linkage.
9. Persist auth lifecycle audit events to DB.
10. Add rate-limit strategy compatible with multi-instance deployment (Redis/Upstash or DB-backed).

---

## Current Redirect Configuration (Observed vs Required)

### Observed in code/docs
- Callback route: `/auth/callback`
- Reset page currently used: `/reset-password`
- Setup guide mentions adding callback and reset-password URL.

### Required target
- `/auth/callback`
- `/auth/set-password`
- `/auth/reset-password`
- `/login`
- Strict allowlist validation for all internal redirects.

---

## Recommended Implementation Order

1. Finalize account lifecycle schema migration + RLS policy updates.
2. Implement unified server-side account creation service (no passwords in payload).
3. Implement invite-first flow with `inviteUserByEmail`.
4. Implement `/auth/set-password` with policy/strength validation.
5. Replace first-login bootstrap logic and remove temp-password dependencies.
6. Harden forgot/reset flows to neutral responses + secure callback routing.
7. Implement invitation management + reconciliation APIs and admin UI.
8. Add durable auth lifecycle audit logs.
9. Add distributed rate limiting for auth-sensitive endpoints.
10. Execute full QA matrix (role-by-role, link expiry, duplicate/partial failure, SMTP delivery).

---

## Test/Validation Status of This Audit

- Code-level repository audit completed for auth-related routes, clients, and core SQL definitions.
- No broad auth refactor was applied in this phase.
- This document is the authoritative baseline for Phase 2+ implementation.

---

## Known Limitations in Current Audit

- Supabase dashboard runtime settings (Auth templates, URL allowlist, SMTP wiring) cannot be fully verified from repository code alone.
- Production Vercel env/runtime behavior requires deployment-time validation.

