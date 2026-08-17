/** Display label for a profile row (task assigner column, etc.). */
export function assignerDisplayFromProfile(p: {
  full_name: string | null;
  email: string | null;
  role: string | null;
} | null | undefined): string | null {
  if (!p) return null;
  const role = (p.role || "").toLowerCase();
  if (role === "admin" || role === "super_admin") return "Admin";
  return profilePersonName(p);
}

const GENERIC_ROLE_LABELS = new Set([
  "employee",
  "admin",
  "super_admin",
  "super admin",
  "manager",
  "mentor",
  "freelancer",
  "student",
  "user",
  "unknown",
  "unnamed",
]);

export function isGenericRoleLabel(value: string | null | undefined): boolean {
  const trimmed = (value || "").trim().toLowerCase();
  return !trimmed || GENERIC_ROLE_LABELS.has(trimmed);
}

/** Person's actual name — never a role title like "Employee". */
export function profilePersonName(p: {
  full_name?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
} | null | undefined): string | null {
  if (!p) return null;
  const composed = [p.first_name, p.last_name]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  const full = (p.full_name || "").trim();
  const email = (p.email || "").trim();
  const emailLocal = email.includes("@") ? email.slice(0, email.indexOf("@")).replace(/[._]+/g, " ").trim() : email;
  const pick = (value: string) => (value && !isGenericRoleLabel(value) ? value : "");
  return pick(full) || pick(composed) || pick(emailLocal) || pick(email) || null;
}

