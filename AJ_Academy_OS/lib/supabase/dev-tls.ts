let applied = false;

/** Allows Node (Next.js API routes) to reach Supabase on Windows dev machines with SSL inspection. */
export function ensureDevSupabaseTls() {
  if (applied) return;
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.SUPABASE_DEV_INSECURE_SSL === "0") return;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  applied = true;
}
