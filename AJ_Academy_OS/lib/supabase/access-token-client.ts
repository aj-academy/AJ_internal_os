import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

/** Supabase client scoped to the signed-in user (Bearer access token from browser sign-in). */
export function createClientWithAccessToken(accessToken: string) {
  const { url, anonKey, isConfigured } = getSupabasePublicEnv();
  if (!isConfigured) {
    throw new Error("Supabase is not configured.");
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
