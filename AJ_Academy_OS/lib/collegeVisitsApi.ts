import type { CollegeVisitFormValue, CollegeVisitRow } from "@/components/college-visits/collegeVisitsHelpers";
import {
  buildCollegeVisitPayload,
  emptyCollegeContact,
  normalizeCollegeContacts,
  parseCollegeContacts,
  resolveCollegeContacts,
} from "@/components/college-visits/collegeVisitsHelpers";

export function parseCollegeVisitBody(body: unknown): { ok: true; form: CollegeVisitFormValue } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid JSON body." };
  }
  const record = body as Record<string, unknown>;
  const college_name = typeof record.college_name === "string" ? record.college_name.trim() : "";
  if (!college_name) return { ok: false, error: "college_name is required." };

  const contacts =
    record.contacts != null
      ? normalizeCollegeContacts(parseCollegeContacts(record.contacts))
      : resolveCollegeContacts({
          contacts: [],
          contact_number: String(record.contact_number ?? ""),
          email: String(record.email ?? ""),
          connected_person_name: String(record.connected_person_name ?? ""),
          connected_person_role: String(record.connected_person_role ?? ""),
        });

  const form: CollegeVisitFormValue = {
    college_name,
    location: String(record.location ?? ""),
    contact_number: String(record.contact_number ?? ""),
    email: String(record.email ?? ""),
    connected_person_name: String(record.connected_person_name ?? ""),
    connected_person_role: String(record.connected_person_role ?? ""),
    contacts: contacts.length ? contacts : [emptyCollegeContact(true)],
    visit_status: String(record.visit_status ?? "Not Visited"),
    visited_by_name: String(record.visited_by_name ?? ""),
    visit_date: String(record.visit_date ?? ""),
    visited_by: String(record.visited_by ?? ""),
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
    proposal_status: String(record.proposal_status ?? "Not Sent"),
    proposal_amount: String(record.proposal_amount ?? ""),
    proposal_sent_date: String(record.proposal_sent_date ?? ""),
    proposal_link: String(record.proposal_link ?? ""),
    proposal_pdf_url: String(record.proposal_pdf_url ?? ""),
    proposal_pdf_name: String(record.proposal_pdf_name ?? ""),
    proposal_file_name: String(record.proposal_file_name ?? ""),
    proposal_file_path: String(record.proposal_file_path ?? ""),
    proposal_file_type: String(record.proposal_file_type ?? ""),
    proposal_file_size: String(record.proposal_file_size ?? ""),
    proposal_uploaded_at: String(record.proposal_uploaded_at ?? ""),
  };

  return { ok: true, form };
}

export function mapCollegeVisitRow(row: unknown): CollegeVisitRow {
  const r = row as Partial<CollegeVisitRow> & {
    id: string;
    college_name: string;
    contacts?: unknown;
  };
  const contacts = resolveCollegeContacts({
    contacts: r.contacts,
    contact_number: r.contact_number,
    email: r.email,
    connected_person_name: r.connected_person_name,
    connected_person_role: r.connected_person_role,
  });
  return {
    id: r.id,
    college_name: r.college_name,
    location: r.location ?? null,
    contact_number: r.contact_number ?? null,
    email: r.email ?? null,
    connected_person_name: r.connected_person_name ?? null,
    connected_person_role: r.connected_person_role ?? null,
    contacts,
    visit_status: r.visit_status ?? "Not Visited",
    visited_by_name: r.visited_by_name ?? null,
    visit_date: r.visit_date ?? null,
    visited_by: r.visited_by ?? null,
    mou_signed_status: r.mou_signed_status ?? "Not Signed",
    follow_up_stage: r.follow_up_stage ?? null,
    last_follow_up_date: r.last_follow_up_date ?? null,
    next_follow_up_date: r.next_follow_up_date ?? null,
    priority: r.priority ?? "Warm",
    assigned_to: r.assigned_to ?? null,
    assigned_by: r.assigned_by ?? null,
    description: r.description ?? null,
    last_outcome_remarks: r.last_outcome_remarks ?? null,
    lead_score: r.lead_score ?? 0,
    final_status: r.final_status ?? "Open",
    source_reference: r.source_reference ?? null,
    proposal_status: r.proposal_status ?? "Not Sent",
    proposal_amount: r.proposal_amount ?? null,
    proposal_sent_date: r.proposal_sent_date ?? null,
    proposal_link: r.proposal_link ?? null,
    proposal_pdf_url: r.proposal_pdf_url ?? null,
    proposal_pdf_name: r.proposal_pdf_name ?? null,
    proposal_file_name: r.proposal_file_name ?? null,
    proposal_file_path: r.proposal_file_path ?? null,
    proposal_file_type: r.proposal_file_type ?? null,
    proposal_file_size: r.proposal_file_size ?? null,
    proposal_uploaded_at: r.proposal_uploaded_at ?? null,
    created_by: r.created_by ?? null,
    created_at: r.created_at ?? "",
    updated_at: r.updated_at ?? "",
  };
}

export function buildPayloadFromApi(
  form: CollegeVisitFormValue,
  userId: string,
  isDbAdmin: boolean,
) {
  return buildCollegeVisitPayload(form, { userId, isDbAdmin });
}
