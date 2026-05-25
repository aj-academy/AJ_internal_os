import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LOGIN_PROFILE_COLUMNS,
  normalizeLoginProfile,
  type LoginProfileRow,
} from "@/lib/auth/profileSelect";

export type ProfileLookupResult = {
  profile: LoginProfileRow | null;
  error: string | null;
  byIdFound: boolean;
  byEmailFound: boolean;
  idMismatch: boolean;
};

function loginLog(label: string, payload: unknown) {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[login-profile] ${label}`, payload);
}

function collectEmails(user: { id: string; email?: string | null }, formEmail?: string) {
  const candidates = [
    formEmail?.trim().toLowerCase(),
    user.email?.trim().toLowerCase(),
  ].filter((value): value is string => Boolean(value));
  return [...new Set(candidates)];
}

/** Query profiles by auth user id, then by email (case-insensitive). Email match wins over id-only miss. */
export async function lookupProfileByUser(
  client: SupabaseClient,
  user: { id: string; email?: string | null },
  formEmail?: string,
): Promise<ProfileLookupResult> {
  const emails = collectEmails(user, formEmail);

  loginLog("auth user id", user.id);
  loginLog("auth email(s) to try", emails);

  let byIdData: LoginProfileRow | null = null;
  let byIdError: string | null = null;

  const byId = await client
    .from("profiles")
    .select(LOGIN_PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle<LoginProfileRow>();

  loginLog("profile by id result", {
    data: byId.data,
    error: byId.error?.message ?? null,
  });

  if (byId.error) {
    byIdError = byId.error.message;
  } else if (byId.data) {
    byIdData = normalizeLoginProfile(byId.data);
    loginLog("profile by id — found", byIdData);
    return {
      profile: byIdData,
      error: null,
      byIdFound: true,
      byEmailFound: false,
      idMismatch: false,
    };
  }

  if (emails.length === 0) {
    return {
      profile: null,
      error: byIdError,
      byIdFound: false,
      byEmailFound: false,
      idMismatch: false,
    };
  }

  for (const email of emails) {
    const byEmail = await client
      .from("profiles")
      .select(LOGIN_PROFILE_COLUMNS)
      .ilike("email", email)
      .limit(1);

    const row = byEmail.data?.[0] ?? null;

    loginLog(`profile by email result (${email})`, {
      data: row,
      error: byEmail.error?.message ?? null,
    });

    if (byEmail.error) {
      return {
        profile: null,
        error: byEmail.error.message,
        byIdFound: false,
        byEmailFound: false,
        idMismatch: false,
      };
    }

    if (row) {
      const profile = normalizeLoginProfile(row);
      const idMismatch = profile.id !== user.id;

      if (idMismatch) {
        console.warn(
          "Profile email found but id mismatch with auth user id.",
          { authUserId: user.id, profileId: profile.id, email: profile.email },
        );
      }

      loginLog("final profile role", profile.role);
      return {
        profile,
        error: null,
        byIdFound: false,
        byEmailFound: true,
        idMismatch,
      };
    }
  }

  return {
    profile: null,
    error: byIdError,
    byIdFound: false,
    byEmailFound: false,
    idMismatch: false,
  };
}
