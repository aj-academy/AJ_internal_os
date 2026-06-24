import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/profile";

const PORTAL_MEMBER_ROLES = new Set<UserRole>(["employee", "student"]);

export async function requirePortalMemberApiSession(allowedRoles: UserRole[] = ["employee", "student"]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null,
    };
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = (profile?.role ?? "").trim().toLowerCase() as UserRole;
  const allowed = new Set(allowedRoles);

  if (error || !allowed.has(role)) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      user: null,
    };
  }

  return { response: null, user };
}

/** @deprecated Use requirePortalMemberApiSession */
export async function requireEmployeeApiSession() {
  return requirePortalMemberApiSession(["employee"]);
}

export { PORTAL_MEMBER_ROLES };
