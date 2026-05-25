import type { UserRole } from "@/types/profile";
import type { LoginProfileRow } from "@/lib/auth/profileSelect";

export type LoginRoleOption = "admin" | "student" | "freelancer" | "mentor";

const VALID_ROLES = new Set<UserRole>([
  "super_admin",
  "admin",
  "student",
  "freelancer",
  "mentor",
]);

export function validateLoginProfile(
  profile: LoginProfileRow | null,
  selectedRole: LoginRoleOption,
): { ok: true; role: UserRole } | { ok: false; error: string } {
  const roleRaw = profile?.role;
  if (!roleRaw || typeof roleRaw !== "string") {
    return { ok: false, error: "Role not assigned. Please contact admin." };
  }

  const normalizedRole = roleRaw.trim().toLowerCase() as UserRole;

  if (!VALID_ROLES.has(normalizedRole)) {
    return { ok: false, error: "Role not assigned. Please contact admin." };
  }

  const selected = selectedRole.trim().toLowerCase();

  const selectedRoleMatches =
    selected === "admin"
      ? normalizedRole === "admin" || normalizedRole === "super_admin"
      : normalizedRole === selected;

  if (!selectedRoleMatches) {
    return {
      ok: false,
      error: "Selected role does not match your account access.",
    };
  }

  return { ok: true, role: normalizedRole };
}
