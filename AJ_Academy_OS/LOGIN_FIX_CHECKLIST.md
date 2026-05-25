# Login loop fix checklist

## "App cannot reach Supabase" / fetch failed

**Do not delete the user yet.** That message means the **Next.js server** could not call Supabase (Windows SSL/network). Your **browser** can still log in.

The app now signs in **in the browser** first, then saves the session on localhost.

Only **reset the password** if the error says **"Incorrect email or password"** (after this update).

## The usual mistakes (in order)

1. **Secure cookies on localhost** — Browsers drop `Secure` cookies on `http://localhost`. The app now forces `secure: false` in development.

2. **No `profiles` row** — Auth user exists but `public.profiles` is empty → `?error=missing_role`.

3. **RLS not applied** — Run `AJ_Academy_SB/profiles_rls_fix.sql` in Supabase SQL Editor.

4. **Stale URL** — Bookmark `login?error=session` keeps showing the red message. Use **http://localhost:3000/login** only.

5. **Wrong email** — Use the exact email from Supabase → Authentication → Users (not the placeholder unless that user exists).

## Required SQL (once)

```sql
-- Run profiles_rls_fix.sql first, then fix your admin row:
insert into public.profiles (id, full_name, email, role, status)
values (
  'PASTE-AUTH-USER-UUID-HERE',
  'Admin',
  'your-real-email@example.com',
  'admin',
  'active'
)
on conflict (id) do update
  set email = excluded.email,
      role = excluded.role,
      status = excluded.status;
```

## After code changes

```bash
cd AJ_Academy_OS
# Stop old server (Ctrl+C), then:
npm run dev
```

Check: http://localhost:3000/api/health/supabase → `"keysMatchProject": true`

## set-session 401 / "fetch failed" (fixed in code)

Login now:

1. Signs in **in the browser** (talks to Supabase directly).
2. Saves cookies on localhost **without** calling Supabase from the server (`write-auth-cookies.ts`).
3. Redirects to the dashboard even if step 2 warns in the console.

You should **not** need to delete the Auth user. Reset password only if you see **"Incorrect email or password"**.

## SQL shows OK but login still fails?

Your screenshot (`check_result: OK`, `last_sign_in_at` set) proves:

- Auth user exists
- `profiles` row matches
- Password worked at least once in Supabase

The remaining problem is usually **Next.js server not reading the session** (Windows blocks server → Supabase HTTP). The app now uses `getSession()` from cookies instead of `getUser()` for server layouts.

## Do this now (order)

1. `cd AJ_Academy_OS` → stop old dev server (Ctrl+C) → `npm run dev`
2. Open **http://localhost:3000/login** (no `?error=` in URL)
3. Email: `admin123@gmail.com` (or your Auth user email)
4. Password: same as in **Supabase → Authentication → Users**
5. Role: **Admin**
6. Click **Sign in** → should open `/admin/dashboard`

If login fails:

| Message | Fix |
|---------|-----|
| Incorrect email or password | Supabase → Users → reset password for that email |
| Could not load profile | Run `profiles_rls_fix.sql` + `verify_admin_login.sql` |
| missing_role in URL | `profiles.id` must match Auth User UID |
