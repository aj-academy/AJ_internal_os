import type { SupabaseClient } from "@supabase/supabase-js";
import { logSecurityEvent } from "@/lib/security/auditLog";

export type AuditLogEntry = {
  actorId: string | null;
  action: string;
  module?: string;
  targetTable?: string | null;
  targetId?: string | null;
  oldData?: unknown;
  newData?: unknown;
};

/**
 * Writes a durable row into public.audit_logs using a service-role client.
 * Falls back to structured console logging if the insert fails, so a payroll
 * action is never silently un-audited. Pass the admin (service-role) client.
 */
export async function writeAuditLog(admin: SupabaseClient, entry: AuditLogEntry): Promise<void> {
  const row = {
    actor_id: entry.actorId,
    action: entry.action,
    module: entry.module ?? "hr_payroll",
    target_table: entry.targetTable ?? null,
    target_id: entry.targetId ?? null,
    old_data: entry.oldData ?? null,
    new_data: entry.newData ?? null,
  };

  const { error } = await admin.from("audit_logs").insert(row);
  if (error) {
    logSecurityEvent("audit_log_write_failed", {
      action: entry.action,
      module: row.module,
      target_table: row.target_table,
      target_id: row.target_id,
      error: error.message,
    });
  }
}
