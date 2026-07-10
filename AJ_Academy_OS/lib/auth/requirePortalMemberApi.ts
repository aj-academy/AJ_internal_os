import { NextResponse } from "next/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { Profile, UserRole } from "@/types/profile";

const PORTAL_MEMBER_ROLES = new Set<UserRole>(["employee", "student"]);

export async function requirePortalMemberApiSession(allowedRoles: UserRole[] = ["employee", "student"]) {
  const result = await verifySessionRole(new Set(allowedRoles));
  if (result.response) {
    return { response: result.response, user: null, profile: null as Profile | null };
  }
  return { response: null, user: result.user, profile: result.profile };
}

/** @deprecated Use requirePortalMemberApiSession */
export async function requireEmployeeApiSession() {
  return requirePortalMemberApiSession(["employee"]);
}

export { PORTAL_MEMBER_ROLES };
