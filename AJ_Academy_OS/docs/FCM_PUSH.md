# Firebase Cloud Messaging (FCM) — AJ OS

Firebase is used **only** for Cloud Messaging. Supabase remains the auth and database source of truth.

## Manual steps (you must complete)

1. **Supabase SQL** — run `AJ_Academy_SB/fcm_push_devices.sql` in the SQL Editor (after profiles / `is_admin`).
2. **Firebase Console** — Web app + Cloud Messaging + VAPID + service account
3. **Environment variables** — `.env.local` and **Vercel Production + Preview**
4. **Redeploy** after env vars are set
5. Open **`/admin/notification-diagnostics`** and run the action buttons in order
6. Employee Profile → Enable Notifications → Send Test

## Diagnostics

- Page: `/admin/notification-diagnostics`
- Health: `GET /api/notifications/health`
- Debug send: `POST /api/push/debug-send`
- SW config: `GET /api/push/sw-config` (public Firebase config for the service worker)

## Public (browser) env

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
```

## Private (server-only) env

```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Optional future cron:

```
CRON_SECRET=
```

Never commit service-account JSON. Never expose `FIREBASE_PRIVATE_KEY` or Supabase service role to the client.

## Logout behaviour

| Action | FCM token | Push continues |
|--------|-----------|----------------|
| Logout | Kept active | Yes (default) |
| Log out & stop notifications | Deactivated | No |
| Disable on this device | Deactivated | No |
| Admin revoke | Deactivated | No |

## Safe notification bodies

Lock-screen / logged-out pushes use generic copy only (no phones, salaries, notes, amounts). Full detail loads after login.

## Notification click → login return

Unauthenticated users are redirected to `/login?redirect=<safe-path>`. Only same-origin paths starting with `/` are allowed (`lib/security/safeRedirect.ts`).

## Browser limitations (not guaranteed delivery)

Notifications may stop when permission is blocked, OS disables alerts, site data is cleared, PWA is uninstalled, device is offline/off, battery restrictions apply, Firebase invalidates the token, or the browser lacks Web Push.

Custom notification sounds are **not** supported in a standard web PWA (system/browser sound only).

## Rollback

1. Remove Firebase env vars from Vercel and redeploy
2. Optionally drop `push_devices` and ignore `push_*` columns on `in_app_notifications`
3. Existing PWA `public/sw.js` still serves install/offline; FCM data handlers become no-ops without tokens

## Related reminder Web Push

`aj_reminder_push_subscriptions` (VAPID reminders) is separate and unchanged. FCM uses `push_devices`.
