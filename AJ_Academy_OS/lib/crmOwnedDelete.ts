import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingRpc(error: { message?: string; code?: string } | null): boolean {
  if (!error?.message) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("could not find the function") ||
    msg.includes("schema cache") ||
    error.code === "PGRST202"
  );
}

/** Prefer SECURITY DEFINER RPC; fall back to direct delete if SQL patch not applied yet. */
export async function deleteOwnedClients(
  supabase: SupabaseClient,
  ids: string[],
  currentUserId: string,
  opts?: { isAdmin?: boolean },
): Promise<{ deleted: number; error: string | null }> {
  if (!ids.length) return { deleted: 0, error: null };

  const rpc = await supabase.rpc("delete_owned_clients", { p_ids: ids });
  if (!rpc.error) {
    return { deleted: Number(rpc.data ?? 0), error: null };
  }
  if (!isMissingRpc(rpc.error)) {
    return { deleted: 0, error: rpc.error.message };
  }

  let q = supabase.from("clients").delete().in("id", ids);
  if (!opts?.isAdmin) q = q.eq("assigned_to", currentUserId);
  const { data, error } = await q.select("id");
  if (error) return { deleted: 0, error: error.message };
  return { deleted: data?.length ?? 0, error: null };
}

export async function deleteOwnedCollegeVisits(
  supabase: SupabaseClient,
  ids: string[],
  currentUserId: string,
  opts?: { isAdmin?: boolean },
): Promise<{ deleted: number; error: string | null }> {
  if (!ids.length) return { deleted: 0, error: null };

  const rpc = await supabase.rpc("delete_owned_college_visits", { p_ids: ids });
  if (!rpc.error) {
    return { deleted: Number(rpc.data ?? 0), error: null };
  }
  if (!isMissingRpc(rpc.error)) {
    return { deleted: 0, error: rpc.error.message };
  }

  let q = supabase.from("college_visits").delete().in("id", ids);
  if (!opts?.isAdmin) q = q.or(`assigned_to.eq.${currentUserId},created_by.eq.${currentUserId}`);
  const { data, error } = await q.select("id");
  if (error) return { deleted: 0, error: error.message };
  return { deleted: data?.length ?? 0, error: null };
}
