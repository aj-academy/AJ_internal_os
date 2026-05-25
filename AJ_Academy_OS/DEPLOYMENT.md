# Deploy AJ Academy OS (Vercel)

The Next.js app is in **`AJ_Academy_OS`**. The Git repo root (`AJ_Academy`) is not a Next.js app.

## Required: set Root Directory in Vercel (one time)

`rootDirectory` is **not** allowed in `vercel.json` (schema error). Configure it in the dashboard:

1. Open [Vercel](https://vercel.com) → project **aj-internal-os**
2. **Settings** → **General**
3. **Root Directory** → **Edit** → enter: `AJ_Academy_OS`
4. Confirm / Save
5. **Deployments** → **Redeploy** (enable **Clear build cache** if needed)

After this, builds run inside `AJ_Academy_OS` and `/login` works.

## Environment variables

Vercel → **Settings** → **Environment Variables** (Production + Preview):

| Name | Notes |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (server only) |
| `NEXT_PUBLIC_SITE_URL` | e.g. `https://your-app.vercel.app` |

## Supabase auth

Supabase → **Authentication** → **URL configuration**:

- **Site URL:** your Vercel URL  
- **Redirect URLs:** `https://your-app.vercel.app/**`

## URLs

| Path | Purpose |
|------|---------|
| `/` | Redirects to `/login` |
| `/login` | Sign in |

Use the **Vercel deployment URL** (Domains tab), not the GitHub repo page.

## Build failed with `rootDirectory` in vercel.json?

Remove any repo-root `vercel.json` that sets `rootDirectory`. Use the dashboard setting above instead.
