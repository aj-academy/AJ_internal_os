# Deploy AJ Academy OS (Vercel)

## Why deploy says "Ready" but the link shows 404

Vercel built the **wrong folder**. The app is in **`AJ_Academy_OS`**, not the Git repo root.

Symptoms:

- Deployment status: **Ready**
- Opening the URL: **404 NOT_FOUND** (Vercel platform page)
- Observability: **Edge requests** but **0 Function invocations**

That means no Next.js app was deployed.

## Fix (do this once)

1. [Vercel Dashboard](https://vercel.com) → project **aj-internal-os**
2. **Settings** → **General**
3. **Root Directory** → **Edit**
4. Type exactly: `AJ_Academy_OS`
5. Click **Save**
6. **Deployments** tab → **⋯** on latest → **Redeploy**
7. Enable **Clear build cache** → Redeploy

## Check the build log

Open the new deployment → **Building** → search for:

- Good: `Running "install"` in `AJ_Academy_OS` or paths containing `AJ_Academy_OS`
- Bad: build only at repo root with no `AJ_Academy_OS` in paths

If Root Directory is wrong, the repo now runs `scripts/vercel-root-check.mjs` and the build should **fail** with a clear error instead of a silent 404.

## Environment variables

**Settings** → **Environment Variables** (Production + Preview):

| Name |
|------|
| `NEXT_PUBLIC_SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` |

Optional: `NEXT_PUBLIC_SITE_URL` = your `https://….vercel.app` URL

## Supabase

**Authentication** → **URL configuration**:

- **Site URL:** `https://your-app.vercel.app`
- **Redirect URLs:** `https://your-app.vercel.app/**`

## Correct URLs

| URL | Result |
|-----|--------|
| `https://your-project.vercel.app/` | → `/login` |
| `https://your-project.vercel.app/login` | Login page |

Use the domain from **Deployments** → **Domains**, not the GitHub repo URL.

## `vercel.json` note

Do **not** put `rootDirectory` in `vercel.json` (invalid schema). Use the dashboard **Root Directory** field only.
