/** Server-side Supabase auth must not call Supabase HTTP (refresh) — avoids 1–2 min hangs on Windows dev. */
export const serverAuthOptions = {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: false,
} as const;
