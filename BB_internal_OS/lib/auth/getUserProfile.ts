import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/profile";

function pickBestProfile(rows: Profile[] | null | undefined) {
  if (!rows?.length) return null;
  const withRole = rows.find((row) => typeof row.role === "string" && row.role.trim().length > 0);
  return withRole ?? rows[0];
}

export async function getUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null as Profile | null };
  }

  const { data: profileById } = await supabase
    .from("profiles")
    .select("id,full_name,email,role,department,designation,status,created_at")
    .eq("id", user.id)
    .limit(1)
    .returns<Profile[]>();

  let profile = pickBestProfile(profileById);

  // Fallback for legacy/manual seeded rows where profile id may not match auth uid.
  if ((!profile || !profile.role) && user.email) {
    const fallback = await supabase
      .from("profiles")
      .select("id,full_name,email,role,department,designation,status,created_at")
      .ilike("email", user.email.trim())
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<Profile[]>();
    profile = pickBestProfile(fallback.data) ?? profile;
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
