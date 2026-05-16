import { buildCsv } from "@/lib/csv";
import { formatDateTimeIST } from "@/lib/datetime";
import type { EmployeeLeadRow } from "@/components/employee/leads/employeeLeadConfig";
import { displayLeadName } from "@/components/employee/leads/employeeLeadConfig";

/** Canonical CSV columns for import, export, and template (same headers = round-trip safe). */
export const EMPLOYEE_LEAD_CSV_HEADERS = [
  "lead_name",
  "company_name",
  "phone",
  "whatsapp",
  "email",
  "description",
  "source",
  "priority",
  "status",
  "phone_called",
  "whatsapp_sent",
  "last_contacted_at",
] as const;

const HEADER_ALIASES: Record<string, (typeof EMPLOYEE_LEAD_CSV_HEADERS)[number]> = {
  lead_name: "lead_name",
  "lead name": "lead_name",
  company_name: "company_name",
  company: "company_name",
  phone: "phone",
  whatsapp: "whatsapp",
  email: "email",
  description: "description",
  requirement: "description",
  source: "source",
  priority: "priority",
  status: "status",
  phone_called: "phone_called",
  "phone called": "phone_called",
  whatsapp_sent: "whatsapp_sent",
  "whatsapp sent": "whatsapp_sent",
  last_contacted_at: "last_contacted_at",
  "last contacted": "last_contacted_at",
};

export function normalizeEmployeeLeadCsvHeader(header: string): string {
  const trimmed = header.trim().toLowerCase();
  if (HEADER_ALIASES[trimmed]) return HEADER_ALIASES[trimmed];
  return trimmed.replace(/\s+/g, "_");
}

export function buildEmployeeLeadCsvHeaderIndex(headers: string[]) {
  const normalized = headers.map(normalizeEmployeeLeadCsvHeader);
  return (key: (typeof EMPLOYEE_LEAD_CSV_HEADERS)[number]) => normalized.indexOf(key);
}

export function parseEmployeeLeadCsvBool(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return false;
  return v === "yes" || v === "true" || v === "1" || v === "y";
}

export function leadRowToCsvCells(row: EmployeeLeadRow): string[] {
  return [
    displayLeadName(row),
    row.company_name ?? "",
    row.phone ?? "",
    row.whatsapp ?? "",
    row.email ?? "",
    row.requirement ?? "",
    row.source ?? "",
    row.priority ?? "",
    row.status ?? "",
    row.phone_called ? "Yes" : "No",
    row.whatsapp_sent ? "Yes" : "No",
    row.last_contacted_at ? formatDateTimeIST(row.last_contacted_at) : "",
  ];
}

const TEMPLATE_SAMPLE_ROW = [
  "Sample Lead",
  "Sample Company Pvt Ltd",
  "9876543210",
  "9876543210",
  "lead@example.com",
  "Interested in branding services",
  "Referral",
  "Warm",
  "New",
  "No",
  "No",
  "",
];

export function buildEmployeeLeadImportTemplateCsv(): string {
  return buildCsv([...EMPLOYEE_LEAD_CSV_HEADERS], [TEMPLATE_SAMPLE_ROW]);
}
