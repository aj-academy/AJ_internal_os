import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import type { Profile, UserRole } from "@/types/profile";

const ADMIN_ROLES = new Set<UserRole>(["admin", "super_admin"]);

export async function requireAdminApiSession() {
  const { user, profile } = await getUserProfile();

  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null,
      profile: null as Profile | null,
    };
  }

  const role = profile?.role?.trim().toLowerCase() as UserRole | undefined;

  if (!role || !ADMIN_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { error: "Forbidden — admin access required." },
        { status: 403 },
      ),
      user: null,
      profile: null as Profile | null,
    };
  }

  return { response: null, user, profile };
}
