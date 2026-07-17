import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { getRoleRedirectPath } from "@/lib/auth/roleRedirect";
import { safeRelativePath } from "@/lib/security/safeRedirect";
import type { Profile, UserRole } from "@/types/profile";

interface RequireRoleResult {
  profile: Profile;
  userEmail: string;
}

async function loginRedirectWithReturn(errorCode: string) {
  const h = await headers();
  const pathname = h.get("x-ajos-pathname") || "";
  const safe = safeRelativePath(pathname, "");
  if (safe && safe !== "/") {
    redirect(`/login?error=${encodeURIComponent(errorCode)}&redirect=${encodeURIComponent(safe)}`);
  }
  redirect(`/login?error=${encodeURIComponent(errorCode)}`);
}

export async function requireRole(
  allowedRoles: UserRole[],
): Promise<RequireRoleResult> {
  const { user, profile } = await getUserProfile();

  if (!user) {
    await loginRedirectWithReturn("session");
    throw new Error("Unauthorized");
  }

  const roleRaw = profile?.role;
  if (!roleRaw || typeof roleRaw !== "string") {
    await loginRedirectWithReturn("missing_role");
    throw new Error("Missing role");
  }

  const role = roleRaw.trim().toLowerCase() as UserRole;

  if (typeof profile?.status === "string") {
    const status = profile.status.trim().toLowerCase();
    if (status && status !== "active") {
      await loginRedirectWithReturn("inactive");
      throw new Error("Inactive");
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
