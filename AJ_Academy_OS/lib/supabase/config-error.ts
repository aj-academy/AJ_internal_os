const SUPABASE_ENV_NAMES =
  "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY";

/** User-facing message when Supabase public env vars are missing. */
export function getSupabaseConfigErrorMessage(): string {
  if (process.env.NODE_ENV === "production") {
    return `Supabase is not configured. In Vercel → Project → Settings → Environment Variables, add ${SUPABASE_ENV_NAMES} (same values as .env.local), enable Production + Preview, then redeploy.`;
  }
  return `Supabase is not configured. Add ${SUPABASE_ENV_NAMES} to AJ_Academy_OS/.env.local, save the file, then restart npm run dev.`;
}
