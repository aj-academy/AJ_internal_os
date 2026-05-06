import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/profile";

export async function getUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null as Profile | null };
  }

  let { data: profile } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,department,designation,status,created_at")
    .eq("id", user.id)
    .maybeSingle();

  // Fallback for legacy/manual seeded rows where profile id may not match auth uid.
  if (!profile && user.email) {
    const fallback = await supabase
      .from("profiles")
      .select("id,full_name,email,role,department,designation,status,created_at")
      .ilike("email", user.email.trim())
      .limit(1)
      .returns<Profile[]>();
    profile = fallback.data?.[0] ?? null;
  }

  if (profile) {
    const normalizedRole =
      typeof profile.role === "string" ? profile.role.trim().toLowerCase() : profile.role;
    const normalizedStatus =
      typeof profile.status === "string" ? profile.status.trim().toLowerCase() : profile.status;
    profile = {
      ...profile,
      role: normalizedRole as Profile["role"],
      status: normalizedStatus as Profile["status"],
    };
  }

  return { user, profile: profile as Profile | null };
}
