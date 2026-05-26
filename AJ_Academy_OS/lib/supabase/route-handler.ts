import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { applySupabaseCookieOptions } from "@/lib/supabase/cookies";
import { getSupabaseConfigErrorMessage } from "@/lib/supabase/config-error";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { serverAuthOptions } from "@/lib/supabase/server-auth-options";

/** Supabase client that writes session cookies onto the route handler response. */
export function createClientFromRequest(
  request: NextRequest,
  response: NextResponse,
) {
  const { url, anonKey, isConfigured } = getSupabasePublicEnv();
  if (!isConfigured) {
    throw new Error(getSupabaseConfigErrorMessage());
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
