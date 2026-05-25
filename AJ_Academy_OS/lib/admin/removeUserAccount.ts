import type { SupabaseClient } from "@supabase/supabase-js";

/** Removes Auth user (and profile via cascade). Preserves completed task rows with assignee snapshot. */
export async function removeUserAccount(
  admin: SupabaseClient,
  profileId: string,
  fullName: string,
  email: string,
) {
  const { error: snapshotError } = await admin
    .from("tasks")
    .update({
      assignee_name: fullName,
      assignee_email: email,
      assigned_to: null,
    })
    .eq("assigned_to", profileId);

  if (snapshotError && !/assignee_name|column/i.test(snapshotError.message ?? "")) {
    throw new Error(snapshotError.message ?? "Could not archive task assignee data.");
  }

  if (snapshotError && /assignee_name|column/i.test(snapshotError.message ?? "")) {
    const { error: clearAssignee } = await admin
      .from("tasks")
      .update({ assigned_to: null })
      .eq("assigned_to", profileId);
    if (clearAssignee) {
      throw new Error(
        "Run AJ_Academy_SB/task_assignee_snapshot.sql in Supabase, then retry remove user.",
      );
    }
  }

  const { error: authError } = await admin.auth.admin.deleteUser(profileId);
  if (authError) {
    throw new Error(authError.message ?? "Could not delete login credentials.");
  }

  return { ok: true as const };
}
