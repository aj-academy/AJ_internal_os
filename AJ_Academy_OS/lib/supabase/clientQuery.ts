export type SupabaseQueryError = {
  table: string;
  message: string;
  code?: string;
};

/** Run a Supabase query; collect errors instead of throwing (for batched dashboard loads). */
export async function fetchOrEmpty<T>(
  table: string,
  query: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>,
  errors: SupabaseQueryError[],
  fallback: T,
): Promise<T> {
  const res = await query;
  if (res.error) {
    errors.push({ table, message: res.error.message, code: res.error.code });
    return fallback;
  }
  return (res.data as T) ?? fallback;
}

export function isRlsOrPermissionError(err: SupabaseQueryError): boolean {
  if (err.code === "42501") return true;
  const m = err.message.toLowerCase();
  return (
    m.includes("permission denied") ||
    m.includes("row-level security") ||
    m.includes("policy") ||
    m.includes("infinite recursion")
  );
}

/** User-facing hint when batched queries return empty because of RLS / role issues. */
export function formatBatchAccessWarning(errors: SupabaseQueryError[]): string | null {
  if (!errors.length) return null;
  const tables = [...new Set(errors.map((e) => e.table))];
  const detail = errors[0]?.message ?? "unknown error";
  if (errors.some((e) => e.message.toLowerCase().includes("infinite recursion"))) {
    return `RLS policy recursion blocked: ${tables.join(", ")}. Re-run AJ_Academy_SB/security_rls_access_fix.sql in the Supabase SQL Editor (latest version fixes profiles recursion).`;
  }
  if (errors.some(isRlsOrPermissionError)) {
    return `Data access blocked for: ${tables.join(", ")}. Confirm your profile role is admin/super_admin in Supabase, then run AJ_Academy_SB/security_rls_access_fix.sql in the SQL Editor. (${detail})`;
  }
  return `Could not load: ${tables.join(", ")} — ${detail}`;
}
