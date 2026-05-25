import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { applySupabaseCookieOptions } from "@/lib/supabase/cookies";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { serverAuthOptions } from "@/lib/supabase/server-auth-options";

/** Supabase client that writes session cookies onto the route handler response. */
export function createClientFromRequest(
  request: NextRequest,
  response: NextResponse,
) {
  const { url, anonKey, isConfigured } = getSupabasePublicEnv();
  if (!isConfigured) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
    );
  }

  return createServerClient(url, anonKey, {
    auth: serverAuthOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, applySupabaseCookieOptions(options));
        });
      },
    },
  });
}
