import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfigErrorMessage } from "@/lib/supabase/config-error";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export function createClient() {
  const { url, anonKey, isConfigured } = getSupabasePublicEnv();
  if (!isConfigured) {
    throw new Error(getSupabaseConfigErrorMessage());
  }
  return createBrowserClient(url, anonKey, {
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
    },
  });
}
