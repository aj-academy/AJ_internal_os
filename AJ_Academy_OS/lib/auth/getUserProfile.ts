import { createClient } from "@/lib/supabase/server";
import { fetchMyProfile } from "@/lib/auth/fetchMyProfile";
import type { Profile } from "@/types/profile";

export async function getUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null as Profile | null };
  }

  const { profile } = await fetchMyProfile(supabase, user);
  return { user, profile };
}
