# Reminders & Calendar — setup

## 1. Database (required)

In Supabase SQL Editor, run:

`AJ_Academy_SB/aj_reminders_schema.sql`

This is **additive only**. It does not modify Student Master, College Visits, Tasks, Finance, or existing RLS.

Rollback (new objects only): `AJ_Academy_SB/aj_reminders_rollback.sql`

## 2. App routes

- Admin: `/admin/reminders`
- Employee: `/employee/reminders`

## 3. Cron (due alerts / push)

Set env:

```text
CRON_SECRET=long-random-string
```

Vercel Cron hits `/api/reminders/cron/process-alerts` every minute (`vercel.json`).  
Locally you can call:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/reminders/cron/process-alerts
```

## 4. Optional Web Push

```bash
npx web-push generate-vapid-keys
```

```text
REMINDER_VAPID_PUBLIC_KEY=...
REMINDER_VAPID_PRIVATE_KEY=...
NEXT_PUBLIC_REMINDER_VAPID_PUBLIC_KEY=...
```

Install optional server dependency when enabling push:

```bash
npm install web-push
```

When the app is **closed**, only the OS/browser notification sound applies — not the in-app chime.

## 5. Sound

Foreground chime: `/public/sounds/reminder-chime.wav`
