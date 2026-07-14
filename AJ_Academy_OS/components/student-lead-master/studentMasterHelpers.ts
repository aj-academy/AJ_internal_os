import type { CrmLeadStatus } from "./studentMasterConfig";

export type StudentLeadRow = Record<string, unknown> & {
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
  email_sent?: boolean | null;
  email_sent_at?: string | null;
  custom_fields?: Record<string, unknown> | null;
  notes?: string | null;
  proposal_status?: string | null;
  proposal_amount?: number | null;
  proposal_sent_date?: string | null;
  proposal_link?: string | null;
  proposal_file_name?: string | null;
  proposal_file_path?: string | null;
  proposal_file_type?: string | null;
  proposal_file_size?: number | null;
  proposal_uploaded_at?: string | null;
  quotation_link?: string | null;
  agreement_link?: string | null;
  converted_at?: string | null;
  lost_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  current_profile?: string | null;
  degree?: string | null;
  college_company?: string | null;
  year_of_passing?: string | null;
  employment_status?: string | null;
  current_salary?: number | null;
  interested_program?: string | null;
  career_goal?: string | null;
  preferred_job_role?: string | null;
  target_salary?: number | null;
  current_skill_level?: string | null;
  main_career_problem?: string | null;
  joining_timeline?: string | null;
  payment_plan?: string | null;
  parent_approval_required?: string | null;
  decision_maker?: string | null;
  preferred_batch?: string | null;
  laptop_availability?: string | null;
  lead_stage?: string | null;
  primary_objection?: string | null;
  fee_quoted?: number | null;
  final_fee?: number | null;
  payment_status?: string | null;
  admission_status?: string | null;
};

/** @deprecated Prefer StudentLeadRow */
export type CrmClientRow = StudentLeadRow;

export const STUDENT_LEAD_SELECT = [
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
  "email_sent",
  "email_sent_at",
  "custom_fields",
  "notes",
  "proposal_status",
  "proposal_amount",
  "proposal_sent_date",
  "proposal_link",
  "proposal_file_name",
  "proposal_file_path",
  "proposal_file_type",
  "proposal_file_size",
  "proposal_uploaded_at",
  "quotation_link",
  "agreement_link",
  "converted_at",
  "lost_reason",
  "created_at",
  "updated_at",
  "current_profile",
  "degree",
  "college_company",
  "year_of_passing",
  "employment_status",
  "current_salary",
  "interested_program",
  "career_goal",
  "preferred_job_role",
  "target_salary",
  "current_skill_level",
  "main_career_problem",
  "joining_timeline",
  "payment_plan",
  "parent_approval_required",
  "decision_maker",
  "preferred_batch",
  "laptop_availability",
  "lead_stage",
  "primary_objection",
  "fee_quoted",
  "final_fee",
  "payment_status",
  "admission_status",
].join(",");

/** @deprecated Prefer STUDENT_LEAD_SELECT */
export const CRM_CLIENT_SELECT = STUDENT_LEAD_SELECT;

export function displayLeadName(row: StudentLeadRow) {
  const n = row.lead_name ?? row.name;
  return typeof n === "string" && n.trim() ? n.trim() : "";
}

export function normalizeStatus(raw: string | null | undefined): CrmLeadStatus | string {
  const s = raw?.trim() || "New";
  if (!s || s === "Lead" || s === "New Lead") return "New";
  return s;
}

export function friendlyError(raw: unknown) {
  const msg = raw instanceof Error ? raw.message : "Unexpected error.";
  if (msg.includes("does not exist") || msg.includes("schema cache")) {
    return "Database tables are missing or out of date. Run `student_lead_master_schema.sql`, then `student_master_columns_patch.sql`, then `proposals_file_upload_patch.sql` from AJ_Academy_SB in Supabase SQL Editor.";
  }
  if (
    msg === "Forbidden" ||
    msg.toLowerCase().includes("row-level security") ||
    msg.toLowerCase().includes("permission denied")
  ) {
    return "Save blocked by database permissions. In Supabase SQL Editor, run `employee_student_master_rls.sql` from AJ_Academy_SB (see DATABASE_SETUP_ORDER.txt step 10j), then refresh and try again.";
  }
  return msg;
}

export function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `₹${Number(value).toLocaleString()}`;
}
