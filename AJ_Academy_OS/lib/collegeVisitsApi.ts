import type { CollegeVisitFormValue, CollegeVisitRow } from "@/components/college-visits/collegeVisitsHelpers";
import { buildCollegeVisitPayload } from "@/components/college-visits/collegeVisitsHelpers";

export function parseCollegeVisitBody(body: unknown): { ok: true; form: CollegeVisitFormValue } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid JSON body." };
  }
  const record = body as Record<string, unknown>;
  const college_name = typeof record.college_name === "string" ? record.college_name.trim() : "";
  if (!college_name) return { ok: false, error: "college_name is required." };

  const form: CollegeVisitFormValue = {
    college_name,
    location: String(record.location ?? ""),
    contact_number: String(record.contact_number ?? ""),
    email: String(record.email ?? ""),
    connected_person_name: String(record.connected_person_name ?? ""),
    connected_person_role: String(record.connected_person_role ?? ""),
    visit_status: String(record.visit_status ?? "Not Visited"),
    visit_date: String(record.visit_date ?? ""),
    mou_signed_status: String(record.mou_signed_status ?? "Not Signed"),
    follow_up_stage: String(record.follow_up_stage ?? ""),
    last_follow_up_date: String(record.last_follow_up_date ?? ""),
    next_follow_up_date: String(record.next_follow_up_date ?? ""),
    priority: String(record.priority ?? "Warm"),
    assigned_to: String(record.assigned_to ?? ""),
    description: String(record.description ?? ""),
    last_outcome_remarks: String(record.last_outcome_remarks ?? ""),
    lead_score: String(record.lead_score ?? "0"),
    final_status: String(record.final_status ?? "Open"),
    source_reference: String(record.source_reference ?? ""),
  };

  return { ok: true, form };
}

export function mapCollegeVisitRow(row: unknown): CollegeVisitRow {
  return row as CollegeVisitRow;
}

export function buildPayloadFromApi(
  form: CollegeVisitFormValue,
  userId: string,
  isDbAdmin: boolean,
) {
  return buildCollegeVisitPayload(form, { userId, isDbAdmin });
}
