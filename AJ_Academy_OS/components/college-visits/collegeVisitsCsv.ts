import { buildCsv, downloadCsv, parseCsv } from "@/lib/csv";
import {
  daysSince,
  isFollowUpDue,
  type CollegeVisitFormValue,
  type CollegeVisitRow,
  emptyCollegeVisitForm,
} from "@/components/college-visits/collegeVisitsHelpers";

/** Exact table column headers (excluding Actions). Used for template, export, and import. */
export const COLLEGE_VISIT_CSV_HEADERS = [
  "S.No",
  "College Name",
  "Location",
  "Contact Number",
  "Email ID",
  "Connected Person Name",
  "Role",
  "Visit Status",
  "Visit Date",
  "MOU Signed Status",
  "Follow-up Stage",
  "Last Follow-up Date",
  "Next Follow-up Date",
  "Priority",
  "Owner",
  "Description",
  "Last Outcome / Remarks",
  "Days Since Last Follow-up",
  "Follow-up Due?",
  "Lead Score",
  "Final Status",
  "Source / Reference",
] as const;

export type CollegeVisitCsvHeader = (typeof COLLEGE_VISIT_CSV_HEADERS)[number];

const HEADER_ALIASES: Record<string, CollegeVisitCsvHeader> = {
  "s.no": "S.No",
  sno: "S.No",
  "college name": "College Name",
  college_name: "College Name",
  location: "Location",
  "contact number": "Contact Number",
  contact_number: "Contact Number",
  phone: "Contact Number",
  "email id": "Email ID",
  email: "Email ID",
  "connected person name": "Connected Person Name",
  "connected person": "Connected Person Name",
  connected_person_name: "Connected Person Name",
  role: "Role",
  connected_person_role: "Role",
  "visit status": "Visit Status",
  visit_status: "Visit Status",
  "visit date": "Visit Date",
  visit_date: "Visit Date",
  "mou signed status": "MOU Signed Status",
  "mou status": "MOU Signed Status",
  mou_signed_status: "MOU Signed Status",
  "follow-up stage": "Follow-up Stage",
  "follow up stage": "Follow-up Stage",
  follow_up_stage: "Follow-up Stage",
  "last follow-up date": "Last Follow-up Date",
  "last follow-up": "Last Follow-up Date",
  last_follow_up_date: "Last Follow-up Date",
  "next follow-up date": "Next Follow-up Date",
  "next follow-up": "Next Follow-up Date",
  next_follow_up_date: "Next Follow-up Date",
  priority: "Priority",
  owner: "Owner",
  assigned_to: "Owner",
  description: "Description",
  "last outcome / remarks": "Last Outcome / Remarks",
  "last outcome": "Last Outcome / Remarks",
  last_outcome_remarks: "Last Outcome / Remarks",
  "days since last follow-up": "Days Since Last Follow-up",
  "days since f/u": "Days Since Last Follow-up",
  "follow-up due?": "Follow-up Due?",
  "follow-up due": "Follow-up Due?",
  "lead score": "Lead Score",
  lead_score: "Lead Score",
  "final status": "Final Status",
  final_status: "Final Status",
  "source / reference": "Source / Reference",
  source: "Source / Reference",
  source_reference: "Source / Reference",
};

function normalizeHeader(raw: string): CollegeVisitCsvHeader | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if ((COLLEGE_VISIT_CSV_HEADERS as readonly string[]).includes(raw.trim())) {
    return raw.trim() as CollegeVisitCsvHeader;
  }
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/ /g, "_")] ?? null;
}

export function buildCollegeVisitCsvHeaderIndex(headerRow: string[]): Map<CollegeVisitCsvHeader, number> {
  const map = new Map<CollegeVisitCsvHeader, number>();
  headerRow.forEach((h, i) => {
    const canon = normalizeHeader(h);
    if (canon && !map.has(canon)) map.set(canon, i);
  });
  return map;
}

function cell(cells: string[], idx: Map<CollegeVisitCsvHeader, number>, key: CollegeVisitCsvHeader) {
  const i = idx.get(key);
  if (i == null) return "";
  return (cells[i] ?? "").trim();
}

export function collegeVisitRowToCsvCells(
  row: CollegeVisitRow,
  sno: number,
  ownerLabel: string,
): (string | number)[] {
  const days = daysSince(row.last_follow_up_date);
  return [
    sno,
    row.college_name ?? "",
    row.location ?? "",
    row.contact_number ?? "",
    row.email ?? "",
    row.connected_person_name ?? "",
    row.connected_person_role ?? "",
    row.visit_status ?? "",
    row.visit_date?.slice(0, 10) ?? "",
    row.mou_signed_status ?? "",
    row.follow_up_stage ?? "",
    row.last_follow_up_date?.slice(0, 10) ?? "",
    row.next_follow_up_date?.slice(0, 10) ?? "",
    row.priority ?? "",
    ownerLabel,
    row.description ?? "",
    row.last_outcome_remarks ?? "",
    days != null ? days : "",
    isFollowUpDue(row) ? "Yes" : "No",
    row.lead_score ?? 0,
    row.final_status ?? "",
    row.source_reference ?? "",
  ];
}

export function buildCollegeVisitImportTemplateCsv() {
  const sample = [
    "1",
    "Sample Engineering College",
    "Chennai",
    "9876543210",
    "tpo@college.edu",
    "Dr. Example",
    "TPO",
    "Not Visited",
    "",
    "Not Signed",
    "Initial Contact",
    "",
    "",
    "Warm",
    "",
    "Campus placement drive discussion",
    "",
    "",
    "",
    "0",
    "Open",
    "Referral",
  ];
  return buildCsv([...COLLEGE_VISIT_CSV_HEADERS], [sample]);
}

export function downloadCollegeVisitImportTemplate() {
  downloadCsv("college-visits-import-template.csv", buildCollegeVisitImportTemplateCsv());
}

export function exportCollegeVisitsCsv(
  rows: CollegeVisitRow[],
  ownerNameMap: Record<string, string>,
  filename = `college-visits-${new Date().toISOString().slice(0, 10)}.csv`,
) {
  const data = rows.map((row, i) =>
    collegeVisitRowToCsvCells(row, i + 1, row.assigned_to ? ownerNameMap[row.assigned_to] || "" : ""),
  );
  downloadCsv(filename, buildCsv([...COLLEGE_VISIT_CSV_HEADERS], data));
}

export function resolveOwnerId(
  ownerRaw: string,
  owners: { id: string; label: string; email?: string | null }[],
): string | null {
  const t = ownerRaw.trim().toLowerCase();
  if (!t) return null;
  const byEmail = owners.find((o) => (o.email || "").trim().toLowerCase() === t);
  if (byEmail) return byEmail.id;
  const byLabel = owners.find((o) => o.label.trim().toLowerCase() === t);
  if (byLabel) return byLabel.id;
  const byId = owners.find((o) => o.id === ownerRaw.trim());
  return byId?.id ?? null;
}

export function parseCollegeVisitCsvRows(
  text: string,
  opts: {
    owners: { id: string; label: string; email?: string | null }[];
    defaultOwnerId: string;
    isDbAdmin: boolean;
  },
): { forms: CollegeVisitFormValue[]; errors: string[] } {
  const matrix = parseCsv(text);
  if (matrix.length < 2) throw new Error("CSV must include a header row and at least one data row.");

  const idx = buildCollegeVisitCsvHeaderIndex(matrix[0]);
  if (!idx.has("College Name")) {
    throw new Error('CSV must include a "College Name" column matching the College Visits table.');
  }

  const forms: CollegeVisitFormValue[] = [];
  const errors: string[] = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const cells = matrix[i];
    const collegeName = cell(cells, idx, "College Name");
    if (!collegeName) {
      errors.push(`Row ${i + 1}: College Name is required.`);
      continue;
    }

    const ownerRaw = cell(cells, idx, "Owner");
    const resolvedOwner = resolveOwnerId(ownerRaw, opts.owners);
    const assigned_to = opts.isDbAdmin
      ? resolvedOwner || ownerRaw || ""
      : resolvedOwner || opts.defaultOwnerId;

    if (opts.isDbAdmin && ownerRaw && !resolvedOwner) {
      errors.push(`Row ${i + 1}: Owner "${ownerRaw}" not found (use employee name or email).`);
      continue;
    }

    const email = cell(cells, idx, "Email ID");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Row ${i + 1}: invalid Email ID.`);
      continue;
    }

    const base = emptyCollegeVisitForm(assigned_to);
    forms.push({
      ...base,
      college_name: collegeName,
      location: cell(cells, idx, "Location"),
      contact_number: cell(cells, idx, "Contact Number"),
      email,
      connected_person_name: cell(cells, idx, "Connected Person Name"),
      connected_person_role: cell(cells, idx, "Role"),
      visit_status: cell(cells, idx, "Visit Status") || "Not Visited",
      visit_date: cell(cells, idx, "Visit Date"),
      mou_signed_status: cell(cells, idx, "MOU Signed Status") || "Not Signed",
      follow_up_stage: cell(cells, idx, "Follow-up Stage"),
      last_follow_up_date: cell(cells, idx, "Last Follow-up Date"),
      next_follow_up_date: cell(cells, idx, "Next Follow-up Date"),
      priority: cell(cells, idx, "Priority") || "Warm",
      assigned_to,
      description: cell(cells, idx, "Description"),
      last_outcome_remarks: cell(cells, idx, "Last Outcome / Remarks"),
      lead_score: cell(cells, idx, "Lead Score") || "0",
      final_status: cell(cells, idx, "Final Status") || "Open",
      source_reference: cell(cells, idx, "Source / Reference"),
    });
  }

  return { forms, errors };
}
