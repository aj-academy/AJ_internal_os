import { buildCsv, downloadCsv, parseCsv } from "@/lib/csv";
import { displayLeadName, type CrmClientRow } from "@/components/student-lead-master/studentMasterHelpers";

/**
 * Exact All Students table / Meta CRM Import headers (excluding Actions / Pick / bulk).
 * Matches sheet "CRM Import" in AJ_Academy_Meta_Leads_CRM_Import_*.xlsx
 */
export const STUDENT_MASTER_CSV_HEADERS = [
  "Student Name",
  "Mobile Number",
  "WhatsApp Number",
  "Email",
  "City",
  "Current Profile",
  "Degree",
  "College/Company",
  "Year of Passing",
  "Employment Status",
  "Current Salary",
  "Interested Program",
  "Career Goal",
  "Preferred Job Role",
  "Target Salary",
  "Current Skill Level",
  "Main Career Problem",
  "Joining Timeline",
  "Program Budget",
  "Full Payment or Instalment",
  "Parent Approval Required",
  "Decision Maker",
  "Preferred Batch",
  "Laptop Availability",
  "Lead Source",
  "Assigned Counsellor",
  "Lead Stage",
  "Lead Status",
  "Priority",
  "Primary Objection",
  "Next Follow-up Date",
  "Fee Quoted",
  "Final Fee",
  "Payment Status",
  "Admission Status",
] as const;

export type StudentMasterCsvHeader = (typeof STUDENT_MASTER_CSV_HEADERS)[number];

/** Data columns only (excludes Actions). */
export const STUDENT_MASTER_DATA_COLUMN_COUNT = STUDENT_MASTER_CSV_HEADERS.length;

const HEADER_ALIASES: Record<string, StudentMasterCsvHeader> = {
  "student name": "Student Name",
  lead_name: "Student Name",
  name: "Student Name",
  "mobile number": "Mobile Number",
  phone: "Mobile Number",
  "whatsapp number": "WhatsApp Number",
  whatsapp: "WhatsApp Number",
  email: "Email",
  city: "City",
  "current profile": "Current Profile",
  current_profile: "Current Profile",
  degree: "Degree",
  college: "College/Company",
  "college/company": "College/Company",
  "college / company": "College/Company",
  college_company: "College/Company",
  company_name: "College/Company",
  "year of passing": "Year of Passing",
  year_of_passing: "Year of Passing",
  "employment status": "Employment Status",
  employment_status: "Employment Status",
  "current salary": "Current Salary",
  current_salary: "Current Salary",
  "interested program": "Interested Program",
  interested_program: "Interested Program",
  "career goal": "Career Goal",
  career_goal: "Career Goal",
  "preferred job role": "Preferred Job Role",
  preferred_job_role: "Preferred Job Role",
  "target salary": "Target Salary",
  target_salary: "Target Salary",
  "current skill level": "Current Skill Level",
  current_skill_level: "Current Skill Level",
  "main career problem": "Main Career Problem",
  main_career_problem: "Main Career Problem",
  "joining timeline": "Joining Timeline",
  joining_timeline: "Joining Timeline",
  "program budget": "Program Budget",
  budget: "Program Budget",
  "full payment or instalment": "Full Payment or Instalment",
  "full payment or installment": "Full Payment or Instalment",
  payment_plan: "Full Payment or Instalment",
  "parent approval required": "Parent Approval Required",
  parent_approval_required: "Parent Approval Required",
  "decision maker": "Decision Maker",
  decision_maker: "Decision Maker",
  "preferred batch": "Preferred Batch",
  preferred_batch: "Preferred Batch",
  "laptop availability": "Laptop Availability",
  laptop_availability: "Laptop Availability",
  "lead source": "Lead Source",
  source: "Lead Source",
  "assigned counsellor": "Assigned Counsellor",
  assigned_to: "Assigned Counsellor",
  "lead stage": "Lead Stage",
  lead_stage: "Lead Stage",
  "lead status": "Lead Status",
  status: "Lead Status",
  priority: "Priority",
  "primary objection": "Primary Objection",
  primary_objection: "Primary Objection",
  "next follow-up date": "Next Follow-up Date",
  follow_up_date: "Next Follow-up Date",
  "fee quoted": "Fee Quoted",
  fee_quoted: "Fee Quoted",
  "final fee": "Final Fee",
  final_fee: "Final Fee",
  "payment status": "Payment Status",
  payment_status: "Payment Status",
  "admission status": "Admission Status",
  admission_status: "Admission Status",
};

function normalizeHeader(raw: string): StudentMasterCsvHeader | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  if ((STUDENT_MASTER_CSV_HEADERS as readonly string[]).includes(trimmed)) {
    return trimmed as StudentMasterCsvHeader;
  }
  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/\s+/g, "_")] ?? null;
}

export function buildStudentMasterCsvHeaderIndex(headerRow: string[]): Map<StudentMasterCsvHeader, number> {
  const map = new Map<StudentMasterCsvHeader, number>();
  headerRow.forEach((h, i) => {
    const canon = normalizeHeader(h);
    if (canon && !map.has(canon)) map.set(canon, i);
  });
  return map;
}

function cell(cells: string[], idx: Map<StudentMasterCsvHeader, number>, key: StudentMasterCsvHeader) {
  const i = idx.get(key);
  if (i == null) return "";
  return String(cells[i] ?? "").trim();
}

function money(v: number | null | undefined) {
  return v == null || Number.isNaN(Number(v)) ? "" : String(v);
}

export function studentLeadRowToCsvCells(
  row: CrmClientRow,
  counsellorLabel: string,
): (string | number)[] {
  return [
    displayLeadName(row) || "",
    row.phone ?? "",
    row.whatsapp ?? "",
    row.email ?? "",
    row.city ?? "",
    row.current_profile ?? "",
    row.degree ?? "",
    row.college_company ?? row.company_name ?? "",
    row.year_of_passing ?? "",
    row.employment_status ?? "",
    money(row.current_salary),
    row.interested_program || row.service_interest || "",
    row.career_goal ?? "",
    row.preferred_job_role ?? "",
    money(row.target_salary),
    row.current_skill_level ?? "",
    row.main_career_problem ?? "",
    row.joining_timeline ?? "",
    money(row.budget),
    row.payment_plan ?? "",
    row.parent_approval_required ?? "",
    row.decision_maker ?? "",
    row.preferred_batch ?? "",
    row.laptop_availability ?? "",
    row.source ?? "",
    counsellorLabel,
    row.lead_stage ?? "",
    row.status ?? "",
    row.priority ?? "",
    row.primary_objection ?? "",
    row.follow_up_date ? String(row.follow_up_date).slice(0, 10) : "",
    money(row.fee_quoted),
    money(row.final_fee),
    row.payment_status ?? "",
    row.admission_status ?? "",
  ];
}

export function buildStudentMasterImportTemplateCsv() {
  const sample = [
    "Sample Student",
    "9876543210",
    "9876543210",
    "student@example.com",
    "Chennai",
    "Working Professional",
    "B.E",
    "Sample College",
    "2024",
    "Working Professional",
    "",
    "Corporate Financial Analytics Program",
    "Upgrade current skills",
    "",
    "",
    "All Financial Analytics skills",
    "",
    "Immediate",
    "50000",
    "Full Payment",
    "No",
    "Self",
    "Online",
    "Yes",
    "Meta Ads - Instagram",
    "",
    "New Lead",
    "Not Contacted",
    "Warm",
    "",
    "",
    "",
    "",
    "Pending",
    "Enquiry",
  ];
  return buildCsv([...STUDENT_MASTER_CSV_HEADERS], [sample]);
}

export function downloadStudentMasterImportTemplate() {
  downloadCsv("student-master-import-template.csv", buildStudentMasterImportTemplateCsv());
}

export function exportStudentMasterCsv(
  rows: CrmClientRow[],
  counsellorNameMap: Record<string, string>,
  filename = `student-master-${new Date().toISOString().slice(0, 10)}.csv`,
) {
  const data = rows.map((row) =>
    studentLeadRowToCsvCells(row, row.assigned_to ? counsellorNameMap[row.assigned_to] || "" : ""),
  );
  downloadCsv(filename, buildCsv([...STUDENT_MASTER_CSV_HEADERS], data));
}

export function resolveCounsellorId(
  raw: string,
  people: { id: string; label: string; email?: string | null }[],
): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  const byEmail = people.find((p) => (p.email || "").trim().toLowerCase() === t);
  if (byEmail) return byEmail.id;
  const byLabel = people.find((p) => p.label.trim().toLowerCase() === t);
  if (byLabel) return byLabel.id;
  const byId = people.find((p) => p.id === raw.trim());
  return byId?.id ?? null;
}

export type StudentMasterImportPayload = {
  lead_name: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  current_profile: string | null;
  degree: string | null;
  college_company: string | null;
  company_name: string | null;
  year_of_passing: string | null;
  employment_status: string | null;
  current_salary: number | null;
  interested_program: string | null;
  service_interest: string | null;
  career_goal: string | null;
  preferred_job_role: string | null;
  target_salary: number | null;
  current_skill_level: string | null;
  main_career_problem: string | null;
  joining_timeline: string | null;
  budget: number | null;
  payment_plan: string | null;
  parent_approval_required: string | null;
  decision_maker: string | null;
  preferred_batch: string | null;
  laptop_availability: string | null;
  source: string | null;
  assigned_to: string | null;
  assigned_by: string;
  lead_stage: string | null;
  status: string;
  priority: string;
  primary_objection: string | null;
  follow_up_date: string | null;
  fee_quoted: number | null;
  final_fee: number | null;
  payment_status: string | null;
  admission_status: string | null;
};

function numOrNull(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function matrixFromUnknownRows(raw: unknown[][]): string[][] {
  return raw.map((row) => row.map((c) => (c == null ? "" : String(c).trim())));
}

/** Prefer the Meta "CRM Import" sheet when present. */
export function pickStudentMasterImportSheetName(sheetNames: string[]): string {
  const crm = sheetNames.find((n) => n.trim().toLowerCase() === "crm import");
  if (crm) return crm;
  const partial = sheetNames.find((n) => n.toLowerCase().includes("crm"));
  return partial ?? sheetNames[0] ?? "";
}

export async function studentMasterFileToMatrix(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = pickStudentMasterImportSheetName(wb.SheetNames);
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

  const text = await file.text();
  return parseCsv(text);
}

export function parseStudentMasterMatrix(
  matrix: string[][],
  opts: {
    counsellors: { id: string; label: string; email?: string | null }[];
    currentUserId: string;
    isDbAdmin: boolean;
  },
): { payloads: StudentMasterImportPayload[]; errors: string[] } {
  if (matrix.length < 2) throw new Error("File must include a header row and at least one data row.");

  const idx = buildStudentMasterCsvHeaderIndex(matrix[0]);
  if (!idx.has("Student Name")) {
    throw new Error('File must include a "Student Name" column matching the Student Master / Meta CRM Import headers.');
  }

  const payloads: StudentMasterImportPayload[] = [];
  const errors: string[] = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const cells = matrix[i];
    if (!cells.some((c) => String(c ?? "").trim())) continue;

    const studentName = cell(cells, idx, "Student Name");
    if (!studentName) {
      errors.push(`Row ${i + 1}: Student Name is required.`);
      continue;
    }

    const email = cell(cells, idx, "Email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push(`Row ${i + 1}: invalid Email.`);
      continue;
    }

    const counsellorRaw = cell(cells, idx, "Assigned Counsellor");
    const resolved = resolveCounsellorId(counsellorRaw, opts.counsellors);
    if (opts.isDbAdmin && counsellorRaw && !resolved) {
      errors.push(`Row ${i + 1}: Assigned Counsellor "${counsellorRaw}" not found (use name or email).`);
      continue;
    }

    const phone = cell(cells, idx, "Mobile Number") || null;
    const program = cell(cells, idx, "Interested Program") || null;
    const college = cell(cells, idx, "College/Company") || null;

    payloads.push({
      lead_name: studentName,
      name: studentName,
      phone,
      whatsapp: cell(cells, idx, "WhatsApp Number") || phone,
      email: email || null,
      city: cell(cells, idx, "City") || null,
      current_profile: cell(cells, idx, "Current Profile") || null,
      degree: cell(cells, idx, "Degree") || null,
      college_company: college,
      company_name: college,
      year_of_passing: cell(cells, idx, "Year of Passing") || null,
      employment_status: cell(cells, idx, "Employment Status") || null,
      current_salary: numOrNull(cell(cells, idx, "Current Salary")),
      interested_program: program,
      service_interest: program,
      career_goal: cell(cells, idx, "Career Goal") || null,
      preferred_job_role: cell(cells, idx, "Preferred Job Role") || null,
      target_salary: numOrNull(cell(cells, idx, "Target Salary")),
      current_skill_level: cell(cells, idx, "Current Skill Level") || null,
      main_career_problem: cell(cells, idx, "Main Career Problem") || null,
      joining_timeline: cell(cells, idx, "Joining Timeline") || null,
      budget: numOrNull(cell(cells, idx, "Program Budget")),
      payment_plan: cell(cells, idx, "Full Payment or Instalment") || null,
      parent_approval_required: cell(cells, idx, "Parent Approval Required") || null,
      decision_maker: cell(cells, idx, "Decision Maker") || null,
      preferred_batch: cell(cells, idx, "Preferred Batch") || null,
      laptop_availability: cell(cells, idx, "Laptop Availability") || null,
      source: cell(cells, idx, "Lead Source") || null,
      assigned_to: opts.isDbAdmin ? resolved : opts.currentUserId,
      assigned_by: opts.currentUserId,
      lead_stage: cell(cells, idx, "Lead Stage") || null,
      status: cell(cells, idx, "Lead Status") || "New",
      priority: cell(cells, idx, "Priority") || "Warm",
      primary_objection: cell(cells, idx, "Primary Objection") || null,
      follow_up_date: cell(cells, idx, "Next Follow-up Date") || null,
      fee_quoted: numOrNull(cell(cells, idx, "Fee Quoted")),
      final_fee: numOrNull(cell(cells, idx, "Final Fee")),
      payment_status: cell(cells, idx, "Payment Status") || null,
      admission_status: cell(cells, idx, "Admission Status") || null,
    });
  }

  return { payloads, errors };
}

export function parseStudentMasterCsvRows(
  text: string,
  opts: {
    counsellors: { id: string; label: string; email?: string | null }[];
    currentUserId: string;
    isDbAdmin: boolean;
  },
): { payloads: StudentMasterImportPayload[]; errors: string[] } {
  return parseStudentMasterMatrix(parseCsv(text), opts);
}
