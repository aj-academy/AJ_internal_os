/** Columns that exist on the current AJ_internal_OS profiles table. */
export const LOGIN_PROFILE_COLUMNS = "id,full_name,email,role" as const;

export type LoginProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

export function normalizeLoginProfile(row: LoginProfileRow): LoginProfileRow {
  return {
    ...row,
    email: typeof row.email === "string" ? row.email.trim().toLowerCase() : row.email,
    role: typeof row.role === "string" ? row.role.trim().toLowerCase() : row.role,
  };
}
