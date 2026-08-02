import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { Profile, UserRole } from "@/types/profile";

const STAFF_ROLES = new Set<UserRole>(["admin", "super_admin", "employee"]);
const HR_SELF_SERVICE_ROLES = new Set<UserRole>(["admin", "super_admin", "employee", "freelancer"]);

export async function requireStaffApiSession() {
  const result = await verifySessionRole(STAFF_ROLES);
  if (result.response) {
    return { response: result.response, user: null, profile: null as Profile | null };
  }
  return { response: null, user: result.user, profile: result.profile };
}

/** Employee + freelancer (+ admin) for payslips / salary structure / salary queries self-service. */
export async function requireHrSelfServiceApiSession() {
  const result = await verifySessionRole(HR_SELF_SERVICE_ROLES);
  if (result.response) {
    return { response: result.response, user: null, profile: null as Profile | null };
  }
  return { response: null, user: result.user, profile: result.profile };
}
