import { createClient } from "@/lib/supabase/server";
import { loadAuthorizedProfile } from "@/lib/security";
import type { Profile } from "@/types/profile";

/** Server-side profile for layouts and API guards — role always verified from database. */
export async function getUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, profile: null as Profile | null };
  }

  const profile = await loadAuthorizedProfile(user);
  return { user, profile };
}
