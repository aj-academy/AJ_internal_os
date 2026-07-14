import type {
  CollegePriority,
  FinalStatus,
  FollowUpStage,
  MouStatus,
  VisitStatus,
} from "./collegeVisitsConfig";

export type CollegeVisitRow = {
  id: string;
  college_name: string;
  location: string | null;
  contact_number: string | null;
  email: string | null;
  connected_person_name: string | null;
  connected_person_role: string | null;
  visit_status: string;
  visit_date: string | null;
  mou_signed_status: string;
  follow_up_stage: string | null;
  last_follow_up_date: string | null;
  next_follow_up_date: string | null;
  priority: string;
  assigned_to: string | null;
  assigned_by: string | null;
  description: string | null;
  last_outcome_remarks: string | null;
  lead_score: number;
  final_status: string;
  source_reference: string | null;
  proposal_status: string;
  proposal_amount: number | null;
  proposal_sent_date: string | null;
  proposal_link: string | null;
  proposal_pdf_url: string | null;
  proposal_pdf_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CollegeVisitActivityRow = {
  id: string;
  college_visit_id: string;
  activity_type: string;
  notes: string | null;
  old_value: string | null;
  new_value: string | null;
  created_by: string | null;
  created_at: string;
};

export const COLLEGE_VISIT_SELECT = [
  "id",
  "college_name",
  "location",
  "contact_number",
  "email",
  "connected_person_name",
  "connected_person_role",
  "visit_status",
  "visit_date",
  "mou_signed_status",
  "follow_up_stage",
  "last_follow_up_date",
  "next_follow_up_date",
  "priority",
  "assigned_to",
  "assigned_by",
  "description",
  "last_outcome_remarks",
  "lead_score",
  "final_status",
  "source_reference",
  "proposal_status",
  "proposal_amount",
  "proposal_sent_date",
  "proposal_link",
  "proposal_pdf_url",
  "proposal_pdf_name",
  "created_by",
  "created_at",
  "updated_at",
].join(",");

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(`${todayISO()}T00:00:00`);
  return Math.floor((today.getTime() - d.getTime()) / 86400000);
}

export function isFollowUpDue(row: CollegeVisitRow): boolean {
  if (!row.next_follow_up_date) return false;
  if (["Converted", "Lost"].includes(String(row.final_status))) return false;
  return row.next_follow_up_date.slice(0, 10) <= todayISO();
}

export function isMissingCollegeVisitsTable(msg: string) {
  return msg.includes("college_visits") && (msg.includes("does not exist") || msg.includes("schema cache"));
}

export function friendlyCollegeVisitError(raw: unknown) {
  const msg = raw instanceof Error ? raw.message : "Unexpected error.";
  if (
    isMissingCollegeVisitsTable(msg) ||
    (msg.includes("proposal_") && (msg.includes("column") || msg.includes("schema cache")))
  ) {
    return "Database table missing or outdated. Run `college_visits_schema.sql` and `college_visits_proposal_patch.sql` from AJ_Academy_SB in Supabase SQL Editor.";
  }
  if (
    msg === "Forbidden" ||
    msg.toLowerCase().includes("row-level security") ||
    msg.toLowerCase().includes("permission denied")
  ) {
    return "Save blocked by database permissions. Run `college_visits_schema.sql` and ensure `employee_student_master_rls.sql` (is_employee) is applied.";
  }
  return msg;
}

export type CollegeVisitFormValue = {
  college_name: string;
  location: string;
  contact_number: string;
  email: string;
  connected_person_name: string;
  connected_person_role: string;
  visit_status: VisitStatus | string;
  visit_date: string;
  mou_signed_status: MouStatus | string;
  follow_up_stage: FollowUpStage | string;
  last_follow_up_date: string;
  next_follow_up_date: string;
  priority: CollegePriority | string;
  assigned_to: string;
  description: string;
  last_outcome_remarks: string;
  lead_score: string;
  final_status: FinalStatus | string;
  source_reference: string;
  proposal_status: string;
  proposal_amount: string;
  proposal_sent_date: string;
  proposal_link: string;
  proposal_pdf_url: string;
  proposal_pdf_name: string;
};

export function emptyCollegeVisitForm(assignedFallback = ""): CollegeVisitFormValue {
  return {
    college_name: "",
    location: "",
    contact_number: "",
    email: "",
    connected_person_name: "",
    connected_person_role: "",
    visit_status: "Not Visited",
    visit_date: "",
    mou_signed_status: "Not Signed",
    follow_up_stage: "",
    last_follow_up_date: "",
    next_follow_up_date: "",
    priority: "Warm",
    assigned_to: assignedFallback,
    description: "",
    last_outcome_remarks: "",
    lead_score: "0",
    final_status: "Open",
    source_reference: "",
    proposal_status: "Not Sent",
    proposal_amount: "",
    proposal_sent_date: "",
    proposal_link: "",
    proposal_pdf_url: "",
    proposal_pdf_name: "",
  };
}

export function collegeVisitRowToForm(row: CollegeVisitRow): CollegeVisitFormValue {
  return {
    college_name: row.college_name ?? "",
    location: row.location ?? "",
    contact_number: row.contact_number ?? "",
    email: row.email ?? "",
    connected_person_name: row.connected_person_name ?? "",
    connected_person_role: row.connected_person_role ?? "",
    visit_status: row.visit_status ?? "Not Visited",
    visit_date: row.visit_date?.slice(0, 10) ?? "",
    mou_signed_status: row.mou_signed_status ?? "Not Signed",
    follow_up_stage: row.follow_up_stage ?? "",
    last_follow_up_date: row.last_follow_up_date?.slice(0, 10) ?? "",
    next_follow_up_date: row.next_follow_up_date?.slice(0, 10) ?? "",
    priority: row.priority ?? "Warm",
    assigned_to: row.assigned_to ?? "",
    description: row.description ?? "",
    last_outcome_remarks: row.last_outcome_remarks ?? "",
    lead_score: String(row.lead_score ?? 0),
    final_status: row.final_status ?? "Open",
    source_reference: row.source_reference ?? "",
    proposal_status: row.proposal_status ?? "Not Sent",
    proposal_amount: row.proposal_amount != null ? String(row.proposal_amount) : "",
    proposal_sent_date: row.proposal_sent_date?.slice(0, 10) ?? "",
    proposal_link: row.proposal_link ?? "",
    proposal_pdf_url: row.proposal_pdf_url ?? "",
    proposal_pdf_name: row.proposal_pdf_name ?? "",
  };
}

export function buildCollegeVisitPayload(
  v: CollegeVisitFormValue,
  opts: { userId: string; isDbAdmin: boolean },
): Record<string, unknown> {
  const scoreRaw = Number(v.lead_score);
  const amountRaw = Number(v.proposal_amount);
  const assignee = opts.userId;
  return {
    college_name: v.college_name.trim(),
    location: v.location.trim() || null,
    contact_number: v.contact_number.trim() || null,
    email: v.email.trim() || null,
    connected_person_name: v.connected_person_name.trim() || null,
    connected_person_role: v.connected_person_role.trim() || null,
    visit_status: v.visit_status || "Not Visited",
    visit_date: v.visit_date || null,
    mou_signed_status: v.mou_signed_status || "Not Signed",
    follow_up_stage: v.follow_up_stage.trim() || null,
    last_follow_up_date: v.last_follow_up_date || null,
    next_follow_up_date: v.next_follow_up_date || null,
    priority: v.priority || "Warm",
    assigned_to: assignee,
    assigned_by: opts.userId,
    description: v.description.trim() || null,
    last_outcome_remarks: v.last_outcome_remarks.trim() || null,
    lead_score: Number.isFinite(scoreRaw) ? Math.min(100, Math.max(0, Math.round(scoreRaw))) : 0,
    final_status: v.final_status || "Open",
    source_reference: v.source_reference.trim() || null,
    proposal_status: v.proposal_status || "Not Sent",
    proposal_amount: Number.isFinite(amountRaw) && v.proposal_amount.trim() !== "" ? amountRaw : null,
    proposal_sent_date: v.proposal_sent_date || null,
    proposal_link: v.proposal_link.trim() || null,
    proposal_pdf_url: v.proposal_pdf_url.trim() || null,
    proposal_pdf_name: v.proposal_pdf_name.trim() || null,
  };
}
