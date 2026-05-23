import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/types/profile";

const PROFILE_COLUMNS =
  "id,full_name,email,role,department,designation,status,created_at" as const;

function normalizeProfile(row: Profile): Profile {
  const normalizedRole =
    typeof row.role === "string" ? row.role.trim().toLowerCase() : row.role;
  const normalizedStatus =
    typeof row.status === "string" ? row.status.trim().toLowerCase() : row.status;
  return {
    ...row,
    role: normalizedRole as Profile["role"],
    status: normalizedStatus as Profile["status"],
  };
}

function firstRpcRow(data: unknown): Profile | null {
  if (!data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || !("id" in row)) return null;
  return row as Profile;
}

/** Loads the signed-in user's profile (RPC first, then direct select fallback). */
export async function fetchMyProfile(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<{ profile: Profile | null; loadError: string | null }> {
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_my_profile");
  let profile = firstRpcRow(rpcData);

  if (!profile) {
    const byId = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle<Profile>();
    profile = byId.data ?? null;

    if (!profile && user.email) {
      const byEmail = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("email", user.email.trim().toLowerCase())
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<Profile>();
      profile = byEmail.data ?? null;
    }
  }

  if (profile) {
    return { profile: normalizeProfile(profile), loadError: null };
  }

  const loadError = rpcError?.message ?? null;
  return { profile: null, loadError };
}
