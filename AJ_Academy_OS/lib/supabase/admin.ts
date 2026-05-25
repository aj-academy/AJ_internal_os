import { createClient } from "@supabase/supabase-js";
import { ensureDevSupabaseTls } from "@/lib/supabase/dev-tls";
import { createSupabaseServerFetch } from "@/lib/supabase/server-fetch";

ensureDevSupabaseTls();

/**
 * Server-only Supabase client with the service role key.
 * Used for admin auth operations (create/update auth users). Never import in client components.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const customFetch = createSupabaseServerFetch();

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: customFetch ? { fetch: customFetch } : undefined,
  });
}
