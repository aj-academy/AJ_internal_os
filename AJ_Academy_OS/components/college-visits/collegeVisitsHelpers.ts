import type {
  CollegePriority,
  FinalStatus,
  FollowUpStage,
  MouStatus,
  VisitStatus,
} from "./collegeVisitsConfig";

export type CollegeContact = {
  id: string;
  name: string;
  role: string;
  phones: string[];
  email: string;
  is_primary: boolean;
};

export type CollegeVisitRow = {
  id: string;
  college_name: string;
  location: string | null;
  contact_number: string | null;
  email: string | null;
  connected_person_name: string | null;
  connected_person_role: string | null;
  contacts: CollegeContact[];
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
  proposal_file_name: string | null;
  proposal_file_path: string | null;
  proposal_file_type: string | null;
  proposal_file_size: number | null;
  proposal_uploaded_at: string | null;
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
  "contacts",
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
  "proposal_file_name",
  "proposal_file_path",
  "proposal_file_type",
  "proposal_file_size",
  "proposal_uploaded_at",
  "created_by",
  "created_at",
  "updated_at",
].join(",");

const PROPOSAL_FILE_SELECT =
  "proposal_file_name,proposal_file_path,proposal_file_type,proposal_file_size,proposal_uploaded_at,";

/** Fallback when contacts column not migrated yet. */
export const COLLEGE_VISIT_SELECT_LEGACY = COLLEGE_VISIT_SELECT.replace("contacts,", "");

/** Fallback when proposals_file_upload_patch.sql not run yet. */
export const COLLEGE_VISIT_SELECT_NO_PROPOSAL_FILES = COLLEGE_VISIT_SELECT.replace(PROPOSAL_FILE_SELECT, "");
export const COLLEGE_VISIT_SELECT_LEGACY_NO_PROPOSAL_FILES = COLLEGE_VISIT_SELECT_LEGACY.replace(PROPOSAL_FILE_SELECT, "");

export function isMissingContactsColumn(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("contacts") && (m.includes("column") || m.includes("schema cache") || m.includes("does not exist"));
}

export function isMissingProposalFileColumn(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("proposal_file_") && (m.includes("column") || m.includes("schema cache") || m.includes("does not exist"));
}

/** True only when the college_visits TABLE is missing — not when a single column is missing. */
export function isMissingCollegeVisitsTable(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("column")) return false;
  if (m.includes("proposal_file_") || m.includes("contacts")) return false;
  return (
    (m.includes("college_visits") && (m.includes("does not exist") || m.includes("schema cache"))) ||
    (m.includes("could not find the table") && m.includes("college_visits"))
  );
}

export function nextCollegeVisitSelect(current: string, errorMsg: string): string | null {
  if (isMissingContactsColumn(errorMsg)) {
    if (current === COLLEGE_VISIT_SELECT) return COLLEGE_VISIT_SELECT_LEGACY;
    if (current === COLLEGE_VISIT_SELECT_NO_PROPOSAL_FILES) return COLLEGE_VISIT_SELECT_LEGACY_NO_PROPOSAL_FILES;
  }
  if (isMissingProposalFileColumn(errorMsg)) {
    if (current === COLLEGE_VISIT_SELECT) return COLLEGE_VISIT_SELECT_NO_PROPOSAL_FILES;
    if (current === COLLEGE_VISIT_SELECT_LEGACY) return COLLEGE_VISIT_SELECT_LEGACY_NO_PROPOSAL_FILES;
  }
  return null;
}

export const MAX_COLLEGE_CONTACTS = 3;
export const MAX_PHONES_PER_CONTACT = 3;

export function newCollegeContactId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyCollegeContact(isPrimary = false): CollegeContact {
  return {
    id: newCollegeContactId(),
    name: "",
    role: "",
    phones: [""],
    email: "",
    is_primary: isPrimary,
  };
}

function splitLegacyPhones(contact: string | null | undefined): string[] {
  if (!contact?.trim()) return [];
  return contact
    .split(/[/|,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, MAX_PHONES_PER_CONTACT);
}

export function parseCollegeContacts(raw: unknown): CollegeContact[] {
  if (!Array.isArray(raw)) return [];
  const list: CollegeContact[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;
    const phonesRaw = Array.isArray(r.phones)
      ? r.phones.map((p) => String(p ?? "").trim()).filter(Boolean)
      : typeof r.phone === "string"
        ? splitLegacyPhones(r.phone)
        : [];
    list.push({
      id: typeof r.id === "string" && r.id ? r.id : newCollegeContactId(),
      name: String(r.name ?? "").trim(),
      role: String(r.role ?? "").trim(),
      phones: phonesRaw.slice(0, MAX_PHONES_PER_CONTACT),
      email: String(r.email ?? "").trim(),
      is_primary: Boolean(r.is_primary),
    });
    if (list.length >= MAX_COLLEGE_CONTACTS) break;
  }
  return list;
}

/** Prefer JSON contacts; otherwise build one contact from legacy flat columns. */
export function resolveCollegeContacts(row: {
  contacts?: unknown;
  contact_number?: string | null;
  email?: string | null;
  connected_person_name?: string | null;
  connected_person_role?: string | null;
}): CollegeContact[] {
  const parsed = parseCollegeContacts(row.contacts);
  if (parsed.length) return normalizeCollegeContacts(parsed);

  const phones = splitLegacyPhones(row.contact_number);
  const name = (row.connected_person_name ?? "").trim();
  const role = (row.connected_person_role ?? "").trim();
  const email = (row.email ?? "").trim();
  if (!phones.length && !name && !email) return [emptyCollegeContact(true)];

  return normalizeCollegeContacts([
    {
      id: newCollegeContactId(),
      name,
      role,
      phones: phones.length ? phones : [""],
      email,
      is_primary: true,
    },
  ]);
}

export function normalizeCollegeContacts(contacts: CollegeContact[], opts?: { keepEmptyPhones?: boolean }): CollegeContact[] {
  const keepEmpty = Boolean(opts?.keepEmptyPhones);
  const cleaned = contacts
    .slice(0, MAX_COLLEGE_CONTACTS)
    .map((c) => {
      let phones = (c.phones.length ? c.phones : [""]).map((p) => p.trim()).slice(0, MAX_PHONES_PER_CONTACT);
      if (!keepEmpty) {
        phones = phones.filter(Boolean);
      }
      return {
        id: c.id || newCollegeContactId(),
        name: c.name.trim(),
        role: c.role.trim(),
        phones: phones.length ? phones : [""],
        email: c.email.trim(),
        is_primary: Boolean(c.is_primary),
      };
    });

  if (!cleaned.length) return [emptyCollegeContact(true)];

  const primaryIdx = cleaned.findIndex((c) => c.is_primary);
  return cleaned.map((c, i) => ({
    ...c,
    phones: c.phones.length ? c.phones : [""],
    is_primary: primaryIdx >= 0 ? i === primaryIdx : i === 0,
  }));
}

export function getPrimaryCollegeContact(contacts: CollegeContact[]): CollegeContact | null {
  const list = normalizeCollegeContacts(contacts);
  return list.find((c) => c.is_primary) ?? list[0] ?? null;
}

export function flatFieldsFromPrimary(contacts: CollegeContact[]) {
  const primary = getPrimaryCollegeContact(contacts);
  const phones = (primary?.phones ?? []).map((p) => p.trim()).filter(Boolean);
  return {
    contact_number: phones.join(" / ") || null,
    email: primary?.email?.trim() || null,
    connected_person_name: primary?.name?.trim() || null,
    connected_person_role: primary?.role?.trim() || null,
  };
}

export type CollegeOutreachTarget = {
  key: string;
  contactId: string;
  personLabel: string;
  role: string;
  phone: string;
  email: string;
};

/** Every phone/email target for Call / WhatsApp / Email pickers. */
export function collegeOutreachTargets(row: CollegeVisitRow): CollegeOutreachTarget[] {
  const contacts = resolveCollegeContacts(row);
  const targets: CollegeOutreachTarget[] = [];
  for (const c of contacts) {
    const personLabel = c.name.trim() || "Contact";
    const phones = c.phones.map((p) => p.trim()).filter(Boolean);
    if (phones.length) {
      phones.forEach((phone, idx) => {
        targets.push({
          key: `${c.id}-p-${idx}`,
          contactId: c.id,
          personLabel,
          role: c.role,
          phone,
          email: c.email,
        });
      });
    } else if (c.email.trim()) {
      targets.push({
        key: `${c.id}-e`,
        contactId: c.id,
        personLabel,
        role: c.role,
        phone: "",
        email: c.email,
      });
    }
  }
  return targets;
}

/** First usable phone when Contact Number has multiples like "944… / 959…". */
export function primaryCollegePhone(contact: string | null | undefined): string {
  if (!contact?.trim()) return "";
  return contact.split(/[/|,;]+/)[0]?.trim() ?? contact.trim();
}

export function primaryOutreachPhone(row: CollegeVisitRow): string {
  const targets = collegeOutreachTargets(row).filter((t) => t.phone);
  const primary = getPrimaryCollegeContact(resolveCollegeContacts(row));
  if (primary) {
    const hit = targets.find((t) => t.contactId === primary.id && t.phone);
    if (hit) return hit.phone;
  }
  return targets[0]?.phone || primaryCollegePhone(row.contact_number);
}

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

export function friendlyCollegeVisitError(raw: unknown) {
  const msg = raw instanceof Error ? raw.message : "Unexpected error.";
  if (isMissingCollegeVisitsTable(msg)) {
    return "College Visits table is missing. Run `college_visits_schema.sql` from AJ_Academy_SB in Supabase SQL Editor.";
  }
  if (isMissingProposalFileColumn(msg) || (msg.includes("proposal_") && (msg.includes("column") || msg.includes("schema cache")))) {
    return "Proposal file columns are missing. Run `proposals_file_upload_patch.sql` from AJ_Academy_SB in Supabase SQL Editor, then refresh.";
  }
  if (isMissingContactsColumn(msg)) {
    return "Contacts column is missing. Run `college_visits_contacts_patch.sql` from AJ_Academy_SB in Supabase SQL Editor, then refresh.";
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
  contacts: CollegeContact[];
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
  proposal_file_name: string;
  proposal_file_path: string;
  proposal_file_type: string;
  proposal_file_size: string;
  proposal_uploaded_at: string;
};

export function emptyCollegeVisitForm(assignedFallback = ""): CollegeVisitFormValue {
  return {
    college_name: "",
    location: "",
    contact_number: "",
    email: "",
    connected_person_name: "",
    connected_person_role: "",
    contacts: [emptyCollegeContact(true)],
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
    proposal_file_name: "",
    proposal_file_path: "",
    proposal_file_type: "",
    proposal_file_size: "",
    proposal_uploaded_at: "",
  };
}

export function collegeVisitRowToForm(row: CollegeVisitRow): CollegeVisitFormValue {
  const contacts = resolveCollegeContacts(row);
  const flat = flatFieldsFromPrimary(contacts);
  return {
    college_name: row.college_name ?? "",
    location: row.location ?? "",
    contact_number: flat.contact_number ?? "",
    email: flat.email ?? "",
    connected_person_name: flat.connected_person_name ?? "",
    connected_person_role: flat.connected_person_role ?? "",
    contacts,
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
    proposal_file_name: row.proposal_file_name ?? "",
    proposal_file_path: row.proposal_file_path ?? "",
    proposal_file_type: row.proposal_file_type ?? "",
    proposal_file_size: row.proposal_file_size != null ? String(row.proposal_file_size) : "",
    proposal_uploaded_at: row.proposal_uploaded_at ?? "",
  };
}

export function buildCollegeVisitPayload(
  v: CollegeVisitFormValue,
  opts: { userId: string; isDbAdmin: boolean },
): Record<string, unknown> {
  const contacts = normalizeCollegeContacts(v.contacts?.length ? v.contacts : [emptyCollegeContact(true)]);
  const flat = flatFieldsFromPrimary(contacts);
  const scoreRaw = Number(v.lead_score);
  const amountRaw = Number(v.proposal_amount);
  const assignee = opts.userId;
  return {
    college_name: v.college_name.trim(),
    location: v.location.trim() || null,
    contact_number: flat.contact_number,
    email: flat.email,
    connected_person_name: flat.connected_person_name,
    connected_person_role: flat.connected_person_role,
    contacts,
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
    // File metadata is written by /api/proposals/upload — don't overwrite with empty form clears here
  };
}
