import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadAuthorizedProfile } from "@/lib/security/auth/loadAuthorizedProfile";
import type { Profile, UserRole } from "@/types/profile";
import type { User } from "@supabase/supabase-js";

type VerifyResult =
  | { response: null; user: User; profile: Profile }
  | { response: NextResponse; user: null; profile: null };

export async function verifySessionRole(allowedRoles: Set<UserRole>): Promise<VerifyResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null,
      profile: null,
    };
  }

  const profile = await loadAuthorizedProfile(user);
  const role = profile?.role?.trim().toLowerCase() as UserRole | undefined;

  if (!profile || !role || !allowedRoles.has(role)) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      user: null,
      profile: null,
    };
  }

  return { response: null, user, profile };
}
