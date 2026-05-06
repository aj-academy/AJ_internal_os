import { redirect } from "next/navigation";
import type { UserRole } from "@/types/profile";

const ROLE_PATHS: Record<UserRole, string> = {
  super_admin: "/admin/dashboard",
  admin: "/admin/dashboard",
  employee: "/employee/dashboard",
  manager: "/manager/dashboard",
  accounts: "/accounts/dashboard",
};

export function getRoleRedirectPath(role: UserRole) {
  return ROLE_PATHS[role];
}

export function redirectToRoleDashboard(role: UserRole) {
  redirect(getRoleRedirectPath(role));
}
