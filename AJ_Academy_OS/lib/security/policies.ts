import type { UserRole } from "@/types/profile";

/** Maps portal role to company_policies.policy_category. */
export function policyCategoryForRole(role: UserRole): "employee" | "freelancer" | null {
  const normalized = role.trim().toLowerCase();
  if (normalized === "employee" || normalized === "student") return "employee";
  if (normalized === "freelancer") return "freelancer";
  return null;
}
