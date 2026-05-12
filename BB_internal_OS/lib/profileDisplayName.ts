/** Display label for a profile row (task assigner column, etc.). */
export function assignerDisplayFromProfile(p: {
  full_name: string | null;
  email: string | null;
  role: string | null;
} | null | undefined): string | null {
  if (!p) return null;
  const role = (p.role || "").toLowerCase();
  if (role === "admin" || role === "super_admin") return "Admin";
  return p.full_name?.trim() || p.email?.trim() || null;
}
