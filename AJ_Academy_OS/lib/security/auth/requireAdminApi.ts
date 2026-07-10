import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { Profile, UserRole } from "@/types/profile";

const ADMIN_ROLES = new Set<UserRole>(["admin", "super_admin"]);

export async function requireAdminApiSession() {
  const result = await verifySessionRole(ADMIN_ROLES);
  if (result.response) {
    return { response: result.response, user: null, profile: null as Profile | null };
  }
  return { response: null, user: result.user, profile: result.profile };
}
