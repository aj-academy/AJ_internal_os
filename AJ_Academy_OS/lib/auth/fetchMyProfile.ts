import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/types/profile";
import { lookupProfileByUser } from "@/lib/auth/lookupProfile";
import { normalizeLoginProfile } from "@/lib/auth/profileSelect";

export type FetchMyProfileOptions = {
  formEmail?: string;
};

/** Loads profile by auth id, then email (shared by API routes and client helpers). */
export async function fetchMyProfile(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  options?: FetchMyProfileOptions,
): Promise<{
  profile: Profile | null;
  loadError: string | null;
  idMismatch: boolean;
}> {
  const lookup = await lookupProfileByUser(supabase, user, options?.formEmail);

  if (lookup.profile) {
    return {
      profile: normalizeLoginProfile(lookup.profile) as Profile,
      loadError: null,
      idMismatch: lookup.idMismatch,
    };
  }

  return { profile: null, loadError: lookup.error, idMismatch: false };
}
