import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { getRoleRedirectPath } from "@/lib/auth/roleRedirect";
import type { Profile, UserRole } from "@/types/profile";
import { createClient } from "@/lib/supabase/server";

interface RequireRoleResult {
  profile: Profile;
  userEmail: string;
}

export async function requireRole(
  allowedRoles: UserRole[],
): Promise<RequireRoleResult> {
  const { user, profile } = await getUserProfile();

  if (!user) {
    redirect("/login");
  }

  let resolvedProfile = profile;

  if (!resolvedProfile?.role && user?.email) {
    const supabase = await createClient();
    const byId = await supabase
      .from("profiles")
      .select("id,full_name,email,role,department,designation,status,created_at")
      .eq("id", user.id)
      .limit(1)
      .returns<Profile[]>();

    const byEmail = await supabase
      .from("profiles")
      .select("id,full_name,email,role,department,designation,status,created_at")
      .ilike("email", user.email.trim())
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<Profile[]>();

    const candidates = [...(byId.data ?? []), ...(byEmail.data ?? [])];
    const withRole = candidates.find((candidate) => candidate.role && candidate.role.trim().length > 0);
    resolvedProfile = withRole ?? candidates[0] ?? null;

    if (resolvedProfile) {
      resolvedProfile = {
        ...resolvedProfile,
        role:
          typeof resolvedProfile.role === "string"
            ? (resolvedProfile.role.trim().toLowerCase() as UserRole)
            : resolvedProfile.role,
        status:
          typeof resolvedProfile.status === "string"
            ? (resolvedProfile.status.trim().toLowerCase() as Profile["status"])
            : resolvedProfile.status,
      };
    }
  }

  if (!resolvedProfile?.role) {
    redirect("/login?error=missing_role");
  }

  if (resolvedProfile.status !== "active") {
    redirect("/login?error=inactive");
  }

  if (!allowedRoles.includes(resolvedProfile.role)) {
    redirect(getRoleRedirectPath(resolvedProfile.role));
  }

  return {
    profile: resolvedProfile,
    userEmail: user.email ?? "",
  };
}
