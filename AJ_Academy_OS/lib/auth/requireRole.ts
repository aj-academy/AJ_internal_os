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
    redirect("/login?error=session");
  }

  const roleRaw = profile?.role;
  if (!roleRaw || typeof roleRaw !== "string") {
    redirect("/login?error=missing_role");
  }

  const role = roleRaw.trim().toLowerCase() as UserRole;

  if (typeof profile?.status === "string") {
    const status = profile.status.trim().toLowerCase();
    if (status && status !== "active") {
      redirect("/login?error=inactive");
    }
  }

  if (!allowedRoles.includes(role)) {
    redirect(getRoleRedirectPath(role));
  }

  return {
    profile: { ...profile!, role },
    userEmail: user.email ?? "",
  };
}
