export const EMPLOYEE_LEAD_STATUSES = [
  "New",
  "Contacted",
  "Interested",
  "Follow-up Required",
  "Not Interested",
  "Converted",
  "Lost",
] as const;

export const EMPLOYEE_LEAD_PRIORITIES = ["Hot", "Warm", "Cold"] as const;

export const EMPLOYEE_LEAD_SOURCES = [
  "Website",
  "Referral",
  "Social Media",
  "Cold Call",
  "Walk-in",
  "Student",
  "Event",
  "Other",
] as const;

export type EmployeeLeadStatus = (typeof EMPLOYEE_LEAD_STATUSES)[number];
export type EmployeeLeadPriority = (typeof EMPLOYEE_LEAD_PRIORITIES)[number];

export type CommFilter = "" | "called" | "not_called" | "whatsapp_sent" | "whatsapp_pending";

export const EMPLOYEE_LEAD_SELECT = [
  "id",
  "name",
  "lead_name",
  "company_name",
  "email",
  "phone",
  "whatsapp",
  "requirement",
  "source",
  "status",
  "priority",
  "phone_called",
  "whatsapp_sent",
  "phone_called_at",
  "whatsapp_sent_at",
  "last_contacted_at",
  "notes",
  "custom_fields",
  "assigned_to",
  "created_at",
  "updated_at",
].join(",");

export type EmployeeLeadRow = {
  id: string;
  name: string | null;
  lead_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  requirement: string | null;
  source: string | null;
  status: string | null;
  priority: string | null;
  phone_called: boolean;
  whatsapp_sent: boolean;
  phone_called_at: string | null;
  whatsapp_sent_at: string | null;
  last_contacted_at: string | null;
  notes: string | null;
  custom_fields: Record<string, unknown> | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomColumnDef = {
  id: string;
  column_name: string;
  column_key: string;
  column_type: string;
  is_active: boolean;
};

export type LeadActivityRow = {
  id: string;
  client_id: string;
  activity_type: string;
  notes: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

export function displayLeadName(row: EmployeeLeadRow) {
  return (row.lead_name || row.name || "Unnamed lead").trim();
}

export function digitsOnly(phone: string | null | undefined) {
  return (phone ?? "").replace(/\D/g, "");
}

export function whatsAppHref(phone: string | null | undefined) {
  const digits = digitsOnly(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

export function slugColumnKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}
