import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { Profile, UserRole } from "@/types/profile";

const STAFF_ROLES = new Set<UserRole>(["admin", "super_admin", "employee"]);

export async function requireStaffApiSession() {
  const result = await verifySessionRole(STAFF_ROLES);
  if (result.response) {
    return { response: result.response, user: null, profile: null as Profile | null };
  }
  return { response: null, user: result.user, profile: result.profile };
}
