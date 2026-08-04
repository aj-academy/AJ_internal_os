# Forgot Password / Reset Password — Setup & Ops

## Redirect URLs (Supabase Dashboard → Authentication → URL Configuration)

**Site URL:** production AJ OS origin (e.g. `https://your-domain.com`)

**Redirect URLs (allow-list):**

```
https://YOUR-DOMAIN/auth/callback
https://YOUR-DOMAIN/auth/reset-password
https://YOUR-DOMAIN/reset-password
http://localhost:3000/auth/callback
http://localhost:3000/auth/reset-password
http://localhost:3000/reset-password
```

App uses:

`resetPasswordForEmail(..., { redirectTo: ${APP_URL}/auth/callback?next=/auth/reset-password })`

`NEXT_PUBLIC_SITE_URL` should be set in production so emails always point at the correct host.

---

## Zoho Custom SMTP (Supabase → Authentication → SMTP Settings)

Recovery emails are sent by **Supabase Auth**, not the CRM outreach API.

| Setting | Value |
|---|---|
| Sender email | `businessmanager@ajacademy.co.in` (or your verified mailbox) |
| Sender name | `AJ OS \| AchieversJournal` |
| Host | `smtp.zoho.in` |
| Port | `465` |
| Username | same as sender mailbox |
| Password | **Zoho App Password** (not login password / not OAuth secret) |
| TLS | SSL on 465 |

Do not put Zoho credentials in frontend code.

---

## Recovery email template

Supabase Dashboard → Authentication → Email Templates → **Reset Password**

**Subject:** `Reset Your AJ OS Password`

**Body:** paste `AJ_Academy_OS/docs/SUPABASE_RECOVERY_EMAIL_TEMPLATE.html`

Must use only `{{ .ConfirmationURL }}` for the button href. Do not invent custom tokens.

---

## App routes

| Route | Role |
|---|---|
| `/forgot-password` | Request reset (neutral response) |
| `POST /api/auth/forgot-password` | Rate-limited request |
| `/auth/callback` | PKCE exchange → recovery page |
| `/auth/reset-password` | Canonical create-new-password UI |
| `/reset-password` | Redirects to `/auth/reset-password` |
| `POST /api/auth/password-reset-complete` | Durable audit after success |

---

## Password policy (app)

- Minimum 10 characters, maximum 72
- Must include a letter and a number
- Blocks a few common patterns
- Align Supabase Auth minimum length with this (Dashboard → Auth settings)

---

## Deployment

1. Deploy app with `NEXT_PUBLIC_SITE_URL` set.
2. Update Supabase redirect allow-list.
3. Paste recovery HTML template.
4. Verify Zoho SMTP with a test recovery email.
5. Run E2E: forgot → email → reset → login with new password; old password fails.

## Rollback

1. Revert the deploy.
2. Optionally leave Supabase template/SMTP as-is (safe).
3. Legacy `/reset-password` redirect remains harmless.

## Known limitations

- Rate limits are in-memory per server instance (not shared across Vercel instances).
- Real mailbox delivery must be validated in production after SMTP is configured.
- Password-change confirmation email to the user is not implemented in this pass (audit log only).
