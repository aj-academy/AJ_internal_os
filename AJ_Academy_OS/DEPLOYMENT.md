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

If Root Directory is wrong, the deployment may show **Ready** but every URL returns **404** until you set **Root Directory** to `AJ_Academy_OS` and redeploy.

## Environment variables (required for login)

`.env.local` works only on your PC. **Vercel does not read it.** Copy the same values into the dashboard:

**Settings** → **Environment Variables** → add each for **Production** and **Preview**:

| Name | Where to copy from |
|------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → `service_role` key (server only; never expose in client code) |

After saving, **Deployments** → **Redeploy** (clear build cache once if login still fails).

Optional (PWA manifest / install icon URLs only — **not** required for sign-in):

| Name | Example |
|------|---------|
| `NEXT_PUBLIC_SITE_URL` | `https://your-project.vercel.app` |

If you skip `NEXT_PUBLIC_SITE_URL`, Vercel’s deploy URL is used automatically; login still works once the three Supabase variables above are set.

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
