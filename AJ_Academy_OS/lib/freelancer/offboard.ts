import type { SupabaseClient } from "@supabase/supabase-js";
import { removeUserAccount } from "@/lib/admin/removeUserAccount";

export async function snapshotTasksAndOffboardFreelancer(
  admin: SupabaseClient,
  profileId: string,
  fullName: string,
  email: string,
) {
  return removeUserAccount(admin, profileId, fullName, email);
}
