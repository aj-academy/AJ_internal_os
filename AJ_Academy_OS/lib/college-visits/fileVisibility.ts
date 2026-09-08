import type { ProposalEntityKind } from "@/lib/proposalFiles";

export const COLLEGE_FILE_VISIBILITY = {
  ADMIN_ONLY: "admin_only",
  ADMIN_EMPLOYEE: "admin_employee",
} as const;

export type CollegeFileVisibility =
  (typeof COLLEGE_FILE_VISIBILITY)[keyof typeof COLLEGE_FILE_VISIBILITY];

export function isAdminRole(role: string | null | undefined): boolean {
  const normalized = role?.trim().toLowerCase();
  return normalized === "admin" || normalized === "super_admin";
}

export function proposalVisibilityForUpload(
  entityType: ProposalEntityKind,
  actorRole: string | null | undefined,
): CollegeFileVisibility {
  // Student Master behavior is intentionally unchanged by this College patch.
  if (entityType === "student") return COLLEGE_FILE_VISIBILITY.ADMIN_EMPLOYEE;
  return isAdminRole(actorRole)
    ? COLLEGE_FILE_VISIBILITY.ADMIN_ONLY
    : COLLEGE_FILE_VISIBILITY.ADMIN_EMPLOYEE;
}
