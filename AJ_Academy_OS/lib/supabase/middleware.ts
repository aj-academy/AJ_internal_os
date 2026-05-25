import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { applySupabaseCookieOptions } from "@/lib/supabase/cookies";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { serverAuthOptions } from "@/lib/supabase/server-auth-options";

/**
 * Refreshes auth cookies on the response without network calls to Supabase.
 * (Network refresh in Edge middleware caused 1–2 min "fetch failed" hangs on Windows.)
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url, anonKey, isConfigured } = getSupabasePublicEnv();
  if (!isConfigured) return supabaseResponse;

  const supabase = createServerClient(url, anonKey, {
    auth: serverAuthOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, applySupabaseCookieOptions(options));
        });
      },
    },
  });

  await supabase.auth.getSession();
  return supabaseResponse;
}
