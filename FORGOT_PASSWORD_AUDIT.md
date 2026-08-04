# Forgot Password & Reset Password Audit (AJ OS)

Date: 2026-08-04  
Scope: Forgot / reset password only (not full invite onboarding)

---

## Existing functionality

| Piece | Location | Status |
|---|---|---|
| Login “Forgot password?” link | `components/auth/LoginForm.tsx` | Working |
| Forgot page | `/forgot-password` | Partial |
| Reset page | `/reset-password` | Partial |
| Auth callback (PKCE) | `/auth/callback` | Working |
| `resetPasswordForEmail` | Forgot page (client) | Working |
| `exchangeCodeForSession` | Callback + reset page | Working |
| `updateUser({ password })` | Reset page | Working |
| `PASSWORD_RECOVERY` listener | Reset page | Working |
| Sign-out after reset → login | Reset page | Working |
| Safe redirect helper | `lib/security/safeRedirect.ts` | Working |
| Zoho SMTP (outreach) | `lib/email/outreachEmail.ts` | Separate from Auth emails |
| Rate limiting harness | `lib/security/rateLimit.ts` | Not applied to forgot-password |

Auth emails (invite/recovery) are delivered by **Supabase Auth → Custom SMTP (Zoho)**, not by the outreach Nodemailer path.

---

## Broken / incomplete

1. **Account enumeration** — forgot page shows raw Supabase errors and different success copy when send succeeds.
2. **Redirect target** — uses `/reset-password`; target canonical route is `/auth/reset-password`.
3. **APP URL** — uses `window.location.origin` only (preview/local OK; production should prefer `NEXT_PUBLIC_SITE_URL` when set on server).
4. **No rate limit** on forgot-password requests (client-only).
5. **Weak UX** — no strength meter, no show/hide, min length 8 only, raw `updateUser` errors.
6. **No durable audit** for reset request / completion (console `logSecurityEvent` only on callback).
7. **Recovery email template** — not codified in repo; must be set in Supabase Dashboard.
8. **Callback error UX** — invalid code redirects to login with generic error, not a dedicated reset-link state.

---

## Existing routes

- `/login`
- `/forgot-password`
- `/reset-password` (legacy)
- `/auth/callback`
- Missing canonical: `/auth/reset-password`

---

## Email delivery

- **Required:** Supabase Authentication → Custom SMTP → Zoho (`smtp.zoho.in:465`)
- **Not used for recovery:** `/api/outreach/send-email` (CRM/outreach only)
- Recovery link must be Supabase `{{ .ConfirmationURL }}` only

---

## Required changes

1. Server API for forgot-password: rate limit + neutral response + safe audit.
2. Canonical `/auth/reset-password` page with policy UI + recovery session handling.
3. Redirect `/reset-password` → `/auth/reset-password`.
4. Callback `next` default for recovery → `/auth/reset-password`; friendlier invalid-link redirect.
5. Document Supabase redirect URLs + Recovery HTML template + Zoho SMTP checklist.
6. Post-reset audit event (no secrets).

---

## Security risks (current)

| Risk | Severity |
|---|---|
| Email existence leakage via error messages | High |
| Unlimited reset emails (no rate limit) | High |
| Raw provider errors on UI | Medium |
| No password-strength guidance (user friction / weak passwords) | Medium |
| Dual code exchange (callback + page) if both receive `code` | Low (callback usually consumes first) |

---

## Test plan

See Phase 15 matrix in implementation docs: `AJ_Academy_OS/docs/FORGOT_PASSWORD_SETUP.md`.

E2E gate: Forgot → email → link → new password → old rejected → new accepted → role dashboard.

---

## Implementation status (2026-08-04)

### Delivered in code

| Item | Path |
|---|---|
| Audit | `FORGOT_PASSWORD_AUDIT.md` |
| Forgot UI (neutral + branded) | `AJ_Academy_OS/app/forgot-password/page.tsx` |
| Forgot API (rate limit) | `AJ_Academy_OS/app/api/auth/forgot-password/route.ts` |
| Canonical reset UI | `AJ_Academy_OS/app/auth/reset-password/page.tsx` |
| Legacy redirect | `AJ_Academy_OS/app/reset-password/page.tsx` → `/auth/reset-password` |
| Callback hardening | `AJ_Academy_OS/app/auth/callback/route.ts` |
| Post-reset audit API | `AJ_Academy_OS/app/api/auth/password-reset-complete/route.ts` |
| Policy helpers | `lib/auth/passwordPolicy.ts`, `lib/auth/appUrl.ts` |
| Ops + Zoho + redirects | `AJ_Academy_OS/docs/FORGOT_PASSWORD_SETUP.md` |
| Recovery HTML template | `AJ_Academy_OS/docs/SUPABASE_RECOVERY_EMAIL_TEMPLATE.html` |

### Dashboard steps still required (not automatable in repo)

1. Paste recovery HTML into Supabase Email Templates → Reset Password.
2. Configure Zoho Custom SMTP in Supabase Auth.
3. Allow-list production + localhost redirect URLs.
4. Set `NEXT_PUBLIC_SITE_URL` on Vercel.
5. Run real E2E with a live mailbox (T07–T19, T25–T27).

### Automated checks

- TypeScript: pass (`tsc --noEmit`)
- Real email delivery / Vercel redirect: **manual** after SMTP + URL config

