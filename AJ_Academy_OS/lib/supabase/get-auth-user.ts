import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Reads user from cookies only — no getUser() network call. */
export async function getAuthUser(supabase: SupabaseClient): Promise<User | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.user ?? null;
}
