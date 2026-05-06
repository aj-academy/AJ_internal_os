import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { getRoleRedirectPath } from "@/lib/auth/roleRedirect";
import type { Profile, UserRole } from "@/types/profile";

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

  if (!profile?.role) {
    redirect("/login?error=missing_role");
  }

  if (profile.status !== "active") {
    redirect("/login?error=inactive");
  }

  if (!allowedRoles.includes(profile.role)) {
    redirect(getRoleRedirectPath(profile.role));
  }

  return {
    profile,
    userEmail: user.email ?? "",
  };
}
