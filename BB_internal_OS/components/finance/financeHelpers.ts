import type { ClientOption } from "@/types/project";

export const TX_SELECT =
  "id,transaction_code,transaction_type,category,amount,payment_method,payment_status,transaction_date,project_id,client_id,employee_id,description,reference_number,attachment_url,created_by,created_at,updated_at";

export const CLAIM_SELECT =
  "id,claim_code,employee_id,expense_type,amount,expense_date,payment_method,receipt_url,reason,approval_status,approved_by,approved_at,rejection_reason,created_at,updated_at";

export const PAYMENT_SELECT =
  "id,project_id,client_id,amount,payment_date,payment_method,payment_status,invoice_number,notes,created_by,created_at";

export function formatInr(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export function isMissingFinanceTable(msg: string) {
  const m = msg.toLowerCase();
  return (
    (m.includes("could not find the table") && (m.includes("finance") || m.includes("expense_claims"))) ||
    (m.includes("relation") && m.includes("does not exist") && m.includes("finance")) ||
    (m.includes("pgrst205") && m.includes("finance"))
  );
}

export function displayClientName(c: Partial<ClientOption>) {
  return String(c.company_name || c.name || c.lead_name || "—");
}

export function friendlyFinanceError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (isMissingFinanceTable(msg)) {
    return "Run BB_internal_SB/finance_schema.sql in Supabase (after projects & clients), then refresh.";
  }
  return msg;
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
