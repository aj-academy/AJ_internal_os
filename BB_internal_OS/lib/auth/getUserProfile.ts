import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/profile";

export const getUserProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null as Profile | null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,department,designation,status,created_at")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile: profile as Profile | null };
});
