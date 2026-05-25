import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { applySupabaseCookieOptions } from "@/lib/supabase/cookies";
import { ensureDevSupabaseTls } from "@/lib/supabase/dev-tls";
import { serverAuthOptions } from "@/lib/supabase/server-auth-options";
import { createSupabaseServerFetch } from "@/lib/supabase/server-fetch";

ensureDevSupabaseTls();

export async function createClient() {
  const cookieStore = await cookies();
  const customFetch = createSupabaseServerFetch();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: serverAuthOptions,
      global: customFetch ? { fetch: customFetch } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, applySupabaseCookieOptions(options)),
            );
          } catch {
            // setAll from a Server Component during render — reads still work; middleware handles refresh.
          }
        },
      },
    },
  );
}
