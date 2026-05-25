# Deploy AJ Academy OS (Vercel)

The Next.js app lives in **`AJ_Academy_OS`**, not the repository root. If Vercel builds the repo root, every URL returns **404**.

## Vercel project settings

1. **Root Directory:** `AJ_Academy_OS` (required)
2. **Framework Preset:** Next.js
3. **Build Command:** `npm run build` (default)
4. **Install Command:** `npm install` (default)

The repo root `vercel.json` sets `"rootDirectory": "AJ_Academy_OS"` so new deploys pick this up automatically. After changing it, trigger **Redeploy** on Vercel.

## Environment variables

Add these in Vercel → Project → Settings → Environment Variables (same values as local `.env.local`):

| Name | Notes |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (server only) |
| `NEXT_PUBLIC_SITE_URL` | Optional: `https://your-domain.vercel.app` |

## URLs after deploy

| Path | Purpose |
|------|---------|
| `/` | Redirects to `/login` |
| `/login` | Sign in |
| `/admin/dashboard` | Admin (after login) |

Do not open the GitHub repo URL or a folder path without the Vercel deployment hostname.

## Supabase auth redirect

In Supabase → Authentication → URL configuration, add:

- **Site URL:** your Vercel URL (e.g. `https://aj-internal-os.vercel.app`)
- **Redirect URLs:** `https://your-domain.vercel.app/**` and `https://your-domain.vercel.app/auth/callback`

## Still 404?

1. Vercel → Deployments → latest → **Building** logs: confirm `rootDirectory` is `AJ_Academy_OS` and build succeeded.
2. Redeploy with **Clear build cache**.
3. Open the deployment URL from Vercel (not `github.com/...`).
