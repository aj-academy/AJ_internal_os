import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupProfileByUser } from "@/lib/auth/lookupProfile";
import { normalizeLoginProfile } from "@/lib/auth/profileSelect";
import type { Profile, UserRole } from "@/types/profile";

function finalizeProfile(profile: Profile | null): Profile | null {
  if (!profile?.role || typeof profile.role !== "string") return null;
  return {
    ...profile,
    role: profile.role.trim().toLowerCase() as UserRole,
    email:
      typeof profile.email === "string" ? profile.email.trim().toLowerCase() : profile.email,
  };
}

/** Always loads role from the database — never trusts client cookies. */
export async function loadAuthorizedProfile(
  user: { id: string; email?: string | null },
): Promise<Profile | null> {
  try {
    const admin = createAdminClient();
    const lookup = await lookupProfileByUser(admin, user);
    if (lookup.profile) {
      return finalizeProfile(normalizeLoginProfile(lookup.profile) as Profile);
    }
  } catch {
    // Fall through to session-scoped client.
  }

  const supabase = await createClient();
  const lookup = await lookupProfileByUser(supabase, user);
  if (lookup.profile) {
    return finalizeProfile(normalizeLoginProfile(lookup.profile) as Profile);
  }

  return null;
}
