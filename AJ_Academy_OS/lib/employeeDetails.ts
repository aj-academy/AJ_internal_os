import type { SupabaseClient } from "@supabase/supabase-js";

export type EmployeeDetailsRow = {
  phone?: string | null;
  joined_at?: string | null;
  manager_id?: string | null;
  employment_type?: string | null;
  profile_id?: string | null;
  employee_id?: string | null;
};

function isMissingColumnError(message: string, column: string) {
  const m = message.toLowerCase();
  return m.includes(column.toLowerCase()) && (m.includes("does not exist") || m.includes("schema cache"));
}

/**
 * Load optional HR extension row for a user profile.
 * Prefers `profile_id` (no separate employee_id column). Falls back to legacy `employee_id` if present.
 */
export async function fetchEmployeeDetailsForProfile(
  supabase: SupabaseClient,
  profileId: string,
): Promise<{ data: EmployeeDetailsRow | null; error: string | null }> {
  const filters: ("profile_id" | "employee_id")[] = ["profile_id", "employee_id"];

  for (const column of filters) {
    const res = await supabase.from("employee_details").select("*").eq(column, profileId).maybeSingle();
    if (!res.error) {
      return { data: (res.data as EmployeeDetailsRow | null) ?? null, error: null };
    }
    if (isMissingColumnError(res.error.message, column)) {
      continue;
    }
    if (res.error.code === "PGRST116") {
      return { data: null, error: null };
    }
    return { data: null, error: res.error.message };
  }

  return { data: null, error: null };
}

/** Map employee_details + profiles id keys (attendance-style fallbacks). */
export function profileIdFromEmployeeDetailsRow(row: Record<string, unknown>): string | null {
  const keys = [row.profile_id, row.employee_id, row.user_id, row.id]
    .filter((k): k is string => typeof k === "string" && Boolean(k));
  return keys[0] ?? null;
}
