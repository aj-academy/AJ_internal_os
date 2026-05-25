import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupProfileByUser } from "@/lib/auth/lookupProfile";
import { normalizeLoginProfile } from "@/lib/auth/profileSelect";
import {
  profileFromSessionPayload,
  readProfileSessionCookie,
  type ProfileSessionPayload,
} from "@/lib/auth/profile-session-cookie";
import { getAuthUser } from "@/lib/supabase/get-auth-user";
import type { Profile, UserRole } from "@/types/profile";

function cookieMatchesUser(cookie: ProfileSessionPayload, user: User) {
  if (cookie.id === user.id) return true;
  const userEmail = user.email?.trim().toLowerCase();
  return Boolean(userEmail && cookie.email === userEmail);
}

async function loadProfileWithAdmin(user: { id: string; email?: string | null }) {
  try {
    const admin = createAdminClient();
    const lookup = await lookupProfileByUser(admin, user);
    if (lookup.profile) {
      return normalizeLoginProfile(lookup.profile) as Profile;
    }
  } catch {
    return null;
  }
  return null;
}

function finalizeProfile(profile: Profile | null): Profile | null {
  if (!profile?.role || typeof profile.role !== "string") return null;
  return {
    ...profile,
    role: profile.role.trim().toLowerCase() as UserRole,
    email:
      typeof profile.email === "string" ? profile.email.trim().toLowerCase() : profile.email,
  };
}

/** Server-side profile for layouts (login cookie first — no Supabase HTTP required). */
export async function getUserProfile() {
  const supabase = await createClient();
  const user = await getAuthUser(supabase);

  if (!user) {
    return { user: null, profile: null as Profile | null };
  }

  const sessionProfile = await readProfileSessionCookie();
  if (sessionProfile?.role && cookieMatchesUser(sessionProfile, user)) {
    return { user, profile: finalizeProfile(profileFromSessionPayload(sessionProfile)) };
  }

  let profile = await loadProfileWithAdmin(user);

  if (!profile?.role) {
    const lookup = await lookupProfileByUser(supabase, user);
    profile = lookup.profile ? (normalizeLoginProfile(lookup.profile) as Profile) : null;
  }

  return { user, profile: finalizeProfile(profile) };
}
