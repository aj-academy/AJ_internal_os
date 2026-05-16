import type { CrmLeadStatus } from "./crmConfig";

export type CrmClientRow = Record<string, unknown> & {
  id: string;
  name?: string | null;
  lead_name?: string | null;
  client_code?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  city?: string | null;
  industry?: string | null;
  source?: string | null;
  service_interest?: string | null;
  requirement?: string | null;
  budget?: number | null;
  expected_start_date?: string | null;
  status?: string | null;
  priority?: string | null;
  lead_score?: number | null;
  assigned_to?: string | null;
  assigned_by?: string | null;
  follow_up_date?: string | null;
  follow_up_time?: string | null;
  follow_up_type?: string | null;
  last_contacted_at?: string | null;
  phone_called?: boolean | null;
  whatsapp_sent?: boolean | null;
  phone_called_at?: string | null;
  whatsapp_sent_at?: string | null;
  custom_fields?: Record<string, unknown> | null;
  notes?: string | null;
  proposal_status?: string | null;
  proposal_amount?: number | null;
  proposal_sent_date?: string | null;
  proposal_link?: string | null;
  quotation_link?: string | null;
  agreement_link?: string | null;
  converted_at?: string | null;
  lost_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export const CRM_CLIENT_SELECT =
  [
    "id",
    "name",
    "lead_name",
    "client_code",
    "company_name",
    "email",
    "phone",
    "whatsapp",
    "city",
    "industry",
    "source",
    "service_interest",
    "requirement",
    "budget",
    "expected_start_date",
    "status",
    "priority",
    "lead_score",
    "assigned_to",
    "assigned_by",
    "follow_up_date",
    "follow_up_time",
    "follow_up_type",
    "last_contacted_at",
    "phone_called",
    "whatsapp_sent",
    "phone_called_at",
    "whatsapp_sent_at",
    "custom_fields",
    "notes",
    "proposal_status",
    "proposal_amount",
    "proposal_sent_date",
    "proposal_link",
    "quotation_link",
    "agreement_link",
    "converted_at",
    "lost_reason",
    "created_at",
    "updated_at",
  ].join(",");

export function displayLeadName(row: CrmClientRow) {
  const n = row.lead_name ?? row.name;
  return typeof n === "string" && n.trim() ? n.trim() : "";
}

export function normalizeStatus(raw: string | null | undefined): CrmLeadStatus | string {
  const s = raw?.trim() || "New Lead";
  if (!s || s === "Lead") return "New Lead";
  return s;
}

export function friendlyError(raw: unknown) {
  const msg = raw instanceof Error ? raw.message : "Unexpected error.";
  if (msg.includes("does not exist") || msg.includes("schema cache")) {
    return "Database tables are missing or out of date. Run `client_lead_schema.sql` then `client_master_schema.sql` from BB_internal_SB in Supabase SQL Editor.";
  }
  return msg;
}
