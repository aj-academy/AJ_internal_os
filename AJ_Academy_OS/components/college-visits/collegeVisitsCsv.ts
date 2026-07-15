import { buildCsv, downloadCsv, parseCsv } from "@/lib/csv";
import {
  daysSince,
  emptyCollegeContact,
  flatFieldsFromPrimary,
  isFollowUpDue,
  newCollegeContactId,
  normalizeCollegeContacts,
  resolveCollegeContacts,
  type CollegeContact,
  type CollegeVisitFormValue,
  type CollegeVisitRow,
  emptyCollegeVisitForm,
} from "@/components/college-visits/collegeVisitsHelpers";

/**
 * Exact import/export headers.
 * Primary contact uses the original columns; Contact 2 / Contact 3 hold alternate people
 * (Principal, Placement Officer, etc.). Put multiple phones on one person with " / ".
 */
export const COLLEGE_VISIT_CSV_HEADERS = [
  "S.No",
  "College Name",
  "Location",
  "Contact Number",
  "Alternate Phone 2",
  "Alternate Phone 3",
  "Email ID",
  "Connected Person Name",
  "Role",
  "Contact 2 Name",
  "Contact 2 Role",
  "Contact 2 Phone",
  "Contact 2 Alternate Phone 2",
  "Contact 2 Email",
  "Contact 3 Name",
  "Contact 3 Role",
  "Contact 3 Phone",
  "Contact 3 Alternate Phone 2",
  "Contact 3 Email",
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
  "Proposal Status",
  "Proposal Amount",
  "Proposal Sent Date",
  "Proposal Link",
  "Proposal PDF URL",
  "Proposal PDF Name",
] as const;

export type CollegeVisitCsvHeader = (typeof COLLEGE_VISIT_CSV_HEADERS)[number];

const HEADER_ALIASES: Record<string, CollegeVisitCsvHeader> = {
  "s.no": "S.No",
  sno: "S.No",
  "college name": "College Name",
  collegename: "College Name",
  college_name: "College Name",
  college: "College Name",
  "name of college": "College Name",
  "college/institute": "College Name",
  "college / institute": "College Name",
  institute: "College Name",
  "institute name": "College Name",
  location: "Location",
  city: "Location",
  "contact number": "Contact Number",
  contact_number: "Contact Number",
  phone: "Contact Number",
  mobile: "Contact Number",
  "primary phone": "Contact Number",
  "alternate phone 2": "Alternate Phone 2",
  "alternate phone": "Alternate Phone 2",
  "alt phone 2": "Alternate Phone 2",
  "alt phone": "Alternate Phone 2",
  "phone 2": "Alternate Phone 2",
  "alternate phone 3": "Alternate Phone 3",
  "alt phone 3": "Alternate Phone 3",
  "phone 3": "Alternate Phone 3",
  "email id": "Email ID",
  email: "Email ID",
  "connected person name": "Connected Person Name",
  "connected person": "Connected Person Name",
  connected_person_name: "Connected Person Name",
  "contact person": "Connected Person Name",
  "contact person name": "Connected Person Name",
  "contact 1 name": "Connected Person Name",
  "primary contact name": "Connected Person Name",
  role: "Role",
  connected_person_role: "Role",
  "contact 1 role": "Role",
  "primary role": "Role",
  "contact 2 name": "Contact 2 Name",
  "alternate contact name": "Contact 2 Name",
  "contact2 name": "Contact 2 Name",
  "contact 2 role": "Contact 2 Role",
  "alternate contact role": "Contact 2 Role",
  "contact2 role": "Contact 2 Role",
  "contact 2 phone": "Contact 2 Phone",
  "contact 2 number": "Contact 2 Phone",
  "alternate contact phone": "Contact 2 Phone",
  "contact2 phone": "Contact 2 Phone",
  "contact 2 alternate phone 2": "Contact 2 Alternate Phone 2",
  "contact 2 alt phone": "Contact 2 Alternate Phone 2",
  "contact 2 phone 2": "Contact 2 Alternate Phone 2",
  "contact 2 email": "Contact 2 Email",
  "alternate contact email": "Contact 2 Email",
  "contact2 email": "Contact 2 Email",
  "contact 3 name": "Contact 3 Name",
  "contact3 name": "Contact 3 Name",
  "contact 3 role": "Contact 3 Role",
  "contact3 role": "Contact 3 Role",
  "contact 3 phone": "Contact 3 Phone",
  "contact 3 number": "Contact 3 Phone",
  "contact3 phone": "Contact 3 Phone",
  "contact 3 alternate phone 2": "Contact 3 Alternate Phone 2",
  "contact 3 alt phone": "Contact 3 Alternate Phone 2",
  "contact 3 phone 2": "Contact 3 Alternate Phone 2",
  "contact 3 email": "Contact 3 Email",
  "contact3 email": "Contact 3 Email",
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
  "proposal status": "Proposal Status",
  proposal_status: "Proposal Status",
  "proposal amount": "Proposal Amount",
  proposal_amount: "Proposal Amount",
  "proposal sent date": "Proposal Sent Date",
  proposal_sent_date: "Proposal Sent Date",
  "proposal link": "Proposal Link",
  proposal_link: "Proposal Link",
  "proposal pdf url": "Proposal PDF URL",
  proposal_pdf_url: "Proposal PDF URL",
  "proposal pdf name": "Proposal PDF Name",
  proposal_pdf_name: "Proposal PDF Name",
};

function stripBom(s: string) {
  return s.replace(/^\uFEFF/, "");
}

/** Lowercase + collapse spaces/underscores/punctuation so Excel quirks still match. */
function headerLookupKey(raw: string): string {
  return stripBom(raw)
    .trim()
    .toLowerCase()
    .replace(/[\u00a0\u2000-\u200b]/g, " ")
    .replace(/[_/|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(raw: string): CollegeVisitCsvHeader | null {
  const trimmed = stripBom(raw).trim();
  if ((COLLEGE_VISIT_CSV_HEADERS as readonly string[]).includes(trimmed)) {
    return trimmed as CollegeVisitCsvHeader;
  }
  const key = headerLookupKey(raw);
  if (!key) return null;
  return (
    HEADER_ALIASES[key] ??
    HEADER_ALIASES[key.replace(/ /g, "_")] ??
    HEADER_ALIASES[key.replace(/ /g, "")] ??
    null
  );
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
  return stripBom(cells[i] ?? "").trim();
}

function splitPhoneParts(...parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    if (!part?.trim()) continue;
    for (const p of part.split(/[/|,;]+/)) {
      const t = p.trim();
      if (t && !out.includes(t)) out.push(t);
    }
  }
  return out.slice(0, 3);
}

function emailLooksValid(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Build up to 3 contacts from primary + Contact 2 / Contact 3 CSV columns. */
export function contactsFromCollegeVisitCsvCells(
  cells: string[],
  idx: Map<CollegeVisitCsvHeader, number>,
): CollegeContact[] {
  const primaryPhones = splitPhoneParts(
    cell(cells, idx, "Contact Number"),
    cell(cells, idx, "Alternate Phone 2"),
    cell(cells, idx, "Alternate Phone 3"),
  );
  const primary: CollegeContact = {
    id: newCollegeContactId(),
    name: cell(cells, idx, "Connected Person Name"),
    role: cell(cells, idx, "Role"),
    phones: primaryPhones.length ? primaryPhones : [""],
    email: cell(cells, idx, "Email ID"),
    is_primary: true,
  };

  const contact2Phones = splitPhoneParts(
    cell(cells, idx, "Contact 2 Phone"),
    cell(cells, idx, "Contact 2 Alternate Phone 2"),
  );
  const contact2: CollegeContact = {
    id: newCollegeContactId(),
    name: cell(cells, idx, "Contact 2 Name"),
    role: cell(cells, idx, "Contact 2 Role"),
    phones: contact2Phones.length ? contact2Phones : [""],
    email: cell(cells, idx, "Contact 2 Email"),
    is_primary: false,
  };

  const contact3Phones = splitPhoneParts(
    cell(cells, idx, "Contact 3 Phone"),
    cell(cells, idx, "Contact 3 Alternate Phone 2"),
  );
  const contact3: CollegeContact = {
    id: newCollegeContactId(),
    name: cell(cells, idx, "Contact 3 Name"),
    role: cell(cells, idx, "Contact 3 Role"),
    phones: contact3Phones.length ? contact3Phones : [""],
    email: cell(cells, idx, "Contact 3 Email"),
    is_primary: false,
  };

  const hasContent = (c: CollegeContact) =>
    Boolean(c.name.trim() || c.role.trim() || c.email.trim() || c.phones.some((p) => p.trim()));

  const list: CollegeContact[] = [primary];
  if (hasContent(contact2)) list.push(contact2);
  if (hasContent(contact3)) list.push(contact3);
  return normalizeCollegeContacts(list);
}

/** Flatten contacts into primary + Contact 2 / Contact 3 CSV fields for export/template. */
export function collegeContactsToCsvFields(row: CollegeVisitRow): {
  contact_number: string;
  alternate_phone_2: string;
  alternate_phone_3: string;
  email: string;
  connected_person_name: string;
  role: string;
  contact_2_name: string;
  contact_2_role: string;
  contact_2_phone: string;
  contact_2_alternate_phone_2: string;
  contact_2_email: string;
  contact_3_name: string;
  contact_3_role: string;
  contact_3_phone: string;
  contact_3_alternate_phone_2: string;
  contact_3_email: string;
} {
  const contacts = resolveCollegeContacts(row);
  const primaryIdx = Math.max(
    0,
    contacts.findIndex((c) => c.is_primary),
  );
  const ordered = [
    contacts[primaryIdx],
    ...contacts.filter((_, i) => i !== primaryIdx),
  ].filter(Boolean) as CollegeContact[];

  const c1 = ordered[0];
  const c2 = ordered[1];
  const c3 = ordered[2];
  const phones1 = (c1?.phones ?? []).map((p) => p.trim()).filter(Boolean);
  const phones2 = (c2?.phones ?? []).map((p) => p.trim()).filter(Boolean);
  const phones3 = (c3?.phones ?? []).map((p) => p.trim()).filter(Boolean);

  return {
    contact_number: phones1[0] || row.contact_number || "",
    alternate_phone_2: phones1[1] || "",
    alternate_phone_3: phones1[2] || "",
    email: c1?.email?.trim() || row.email || "",
    connected_person_name: c1?.name?.trim() || row.connected_person_name || "",
    role: c1?.role?.trim() || row.connected_person_role || "",
    contact_2_name: c2?.name?.trim() || "",
    contact_2_role: c2?.role?.trim() || "",
    contact_2_phone: phones2[0] || "",
    contact_2_alternate_phone_2: phones2[1] || "",
    contact_2_email: c2?.email?.trim() || "",
    contact_3_name: c3?.name?.trim() || "",
    contact_3_role: c3?.role?.trim() || "",
    contact_3_phone: phones3[0] || "",
    contact_3_alternate_phone_2: phones3[1] || "",
    contact_3_email: c3?.email?.trim() || "",
  };
}

function matrixFromUnknownRows(raw: unknown[][]): string[][] {
  return raw
    .map((row) => row.map((c) => (c == null ? "" : stripBom(String(c)).trim())))
    .filter((row) => row.some((c) => c.length > 0));
}

/** Prefer a sheet named like College Visits when present. */
export function pickCollegeVisitImportSheetName(sheetNames: string[]): string {
  const exact = sheetNames.find((n) => {
    const k = n.trim().toLowerCase();
    return k === "college visits" || k === "colleges" || k === "import";
  });
  if (exact) return exact;
  const partial = sheetNames.find((n) => /college/i.test(n));
  return partial ?? sheetNames[0] ?? "";
}

function parseDelimitedText(text: string): string[][] {
  const cleaned = stripBom(text);
  const firstLine = cleaned.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;

  if (tabs > commas && tabs >= semis) {
    return cleaned
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((c) => stripBom(c).trim()))
      .filter((row) => row.some((c) => c.length > 0));
  }
  if (semis > commas && semis > tabs) {
    return cleaned
      .split(/\r?\n/)
      .map((line) => line.split(";").map((c) => stripBom(c).trim()))
      .filter((row) => row.some((c) => c.length > 0));
  }
  return parseCsv(cleaned).map((row) => row.map((c) => stripBom(c).trim()));
}

/** Read CSV or Excel (.xlsx / .xls) into a string matrix. */
export async function collegeVisitFileToMatrix(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = pickCollegeVisitImportSheetName(wb.SheetNames);
    if (!sheetName || !wb.Sheets[sheetName]) {
      throw new Error("Excel workbook has no readable sheet.");
    }
    const raw = XLSX.utils.sheet_to_json<(string | number | boolean | null | undefined)[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
    });
    return matrixFromUnknownRows(raw as unknown[][]);
  }

  return parseDelimitedText(await file.text());
}

/** Skip title rows; find the row that contains College Name (or alias). */
export function findCollegeVisitHeaderRowIndex(matrix: string[][]): number {
  const scan = Math.min(matrix.length, 15);
  for (let i = 0; i < scan; i += 1) {
    const idx = buildCollegeVisitCsvHeaderIndex(matrix[i] ?? []);
    if (idx.has("College Name")) return i;
  }
  return 0;
}

export function collegeVisitRowToCsvCells(
  row: CollegeVisitRow,
  sno: number,
  ownerLabel: string,
): (string | number)[] {
  const days = daysSince(row.last_follow_up_date);
  const c = collegeContactsToCsvFields(row);
  return [
    sno,
    row.college_name ?? "",
    row.location ?? "",
    c.contact_number,
    c.alternate_phone_2,
    c.alternate_phone_3,
    c.email,
    c.connected_person_name,
    c.role,
    c.contact_2_name,
    c.contact_2_role,
    c.contact_2_phone,
    c.contact_2_alternate_phone_2,
    c.contact_2_email,
    c.contact_3_name,
    c.contact_3_role,
    c.contact_3_phone,
    c.contact_3_alternate_phone_2,
    c.contact_3_email,
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
    row.proposal_status ?? "",
    row.proposal_amount != null ? row.proposal_amount : "",
    row.proposal_sent_date?.slice(0, 10) ?? "",
    row.proposal_link ?? "",
    row.proposal_pdf_url ?? "",
    row.proposal_pdf_name ?? "",
  ];
}

export function buildCollegeVisitImportTemplateCsv() {
  const sample = [
    "1",
    "Sample Engineering College",
    "Chennai",
    "9876543210",
    "9876500001",
    "",
    "principal@college.edu",
    "Dr. Example",
    "Principal",
    "Ms. Placement",
    "Placement Officer",
    "9876500002",
    "",
    "tpo@college.edu",
    "Mr. HOD",
    "HOD",
    "9876500003",
    "",
    "hod@college.edu",
    "Not Visited",
    "",
    "Not Signed",
    "Initial Contact",
    "",
    "",
    "Warm",
    "",
    "Campus placement drive discussion - use Contact 2 / Contact 3 for alternate people",
    "",
    "",
    "",
    "0",
    "Open",
    "Referral",
    "Not Sent",
    "",
    "",
    "",
    "",
    "",
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

export function parseCollegeVisitMatrix(
  matrix: string[][],
  opts: {
    owners: { id: string; label: string; email?: string | null }[];
    defaultOwnerId: string;
    isDbAdmin: boolean;
  },
): { forms: CollegeVisitFormValue[]; errors: string[] } {
  if (matrix.length < 2) throw new Error("File must include a header row and at least one data row.");

  const headerRowIndex = findCollegeVisitHeaderRowIndex(matrix);
  const headerRow = matrix[headerRowIndex] ?? [];
  const idx = buildCollegeVisitCsvHeaderIndex(headerRow);
  if (!idx.has("College Name")) {
    const found = headerRow.filter((h) => h.trim()).slice(0, 12).join(", ") || "(none)";
    throw new Error(
      `File must include a "College Name" column (also accepts college_name / College). Found headers: ${found}. Tip: use Import template, or upload .csv / .xlsx with that column on the first sheet.`,
    );
  }

  const forms: CollegeVisitFormValue[] = [];
  const errors: string[] = [];

  for (let i = headerRowIndex + 1; i < matrix.length; i += 1) {
    const cells = matrix[i];
    const collegeName = cell(cells, idx, "College Name");
    if (!collegeName) {
      errors.push(`Row ${i + 1}: College Name is required.`);
      continue;
    }

    const assigned_to = opts.defaultOwnerId;

    const email = cell(cells, idx, "Email ID");
    const email2 = cell(cells, idx, "Contact 2 Email");
    const email3 = cell(cells, idx, "Contact 3 Email");
    if (email && !emailLooksValid(email)) {
      errors.push(`Row ${i + 1}: invalid Email ID.`);
      continue;
    }
    if (email2 && !emailLooksValid(email2)) {
      errors.push(`Row ${i + 1}: invalid Contact 2 Email.`);
      continue;
    }
    if (email3 && !emailLooksValid(email3)) {
      errors.push(`Row ${i + 1}: invalid Contact 3 Email.`);
      continue;
    }

    const contacts = contactsFromCollegeVisitCsvCells(cells, idx);
    const flat = flatFieldsFromPrimary(contacts.length ? contacts : [emptyCollegeContact(true)]);

    const base = emptyCollegeVisitForm(assigned_to);
    forms.push({
      ...base,
      college_name: collegeName,
      location: cell(cells, idx, "Location"),
      contact_number: flat.contact_number ?? "",
      email: flat.email ?? "",
      connected_person_name: flat.connected_person_name ?? "",
      connected_person_role: flat.connected_person_role ?? "",
      contacts: contacts.length ? contacts : [emptyCollegeContact(true)],
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
      proposal_status: cell(cells, idx, "Proposal Status") || "Not Sent",
      proposal_amount: cell(cells, idx, "Proposal Amount"),
      proposal_sent_date: cell(cells, idx, "Proposal Sent Date"),
      proposal_link: cell(cells, idx, "Proposal Link"),
      proposal_pdf_url: cell(cells, idx, "Proposal PDF URL"),
      proposal_pdf_name: cell(cells, idx, "Proposal PDF Name"),
    });
  }

  return { forms, errors };
}

/** Prefer collegeVisitFileToMatrix + parseCollegeVisitMatrix for Excel support. */
export function parseCollegeVisitCsvRows(
  text: string,
  opts: {
    owners: { id: string; label: string; email?: string | null }[];
    defaultOwnerId: string;
    isDbAdmin: boolean;
  },
): { forms: CollegeVisitFormValue[]; errors: string[] } {
  return parseCollegeVisitMatrix(parseDelimitedText(text), opts);
}
