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
  "email id": "Email ID",
  email: "Email ID",
  "connected person name": "Connected Person Name",
  "connected person": "Connected Person Name",
  connected_person_name: "Connected Person Name",
  "contact person": "Connected Person Name",
  "contact person name": "Connected Person Name",
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
