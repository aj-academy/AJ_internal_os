import type { Profile, UserRole } from "@/types/profile";

export function assertSuperAdminActor(
  actor: Profile | null | undefined,
  targetRole: string,
): { ok: true } | { ok: false; error: string } {
  const role = targetRole.trim().toLowerCase();
  if (role !== "super_admin") return { ok: true };

  const actorRole = (actor?.role ?? "").trim().toLowerCase() as UserRole;
  if (actorRole !== "super_admin") {
    return { ok: false, error: "Only a super admin can assign or create super admin accounts." };
  }
  return { ok: true };
}
