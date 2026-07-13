import { buildCsv, downloadCsv, parseCsv } from "@/lib/csv";
import { displayLeadName, type CrmClientRow } from "@/components/student-lead-master/studentMasterHelpers";

/** Exact All Students table column headers (excluding Actions / Pick / bulk checkbox). */
export const STUDENT_MASTER_CSV_HEADERS = [
  "Student Name",
  "Mobile Number",
  "WhatsApp Number",
  "Email",
  "Degree",
  "College",
  "Year of Passing",
  "Employment Status",
  "Current Salary",
  "Interested Program",
  "Joining Timeline",
  "Program Budget",
  "Preferred Batch",
  "Lead Source",
  "Assigned Counsellor",
  "Lead Stage",
  "Lead Status",
  "Priority",
  "Next Follow-up Date",
  "Fee Quoted",
  "Final Fee",
  "Payment Status",
  "Admission Status",
] as const;

export type StudentMasterCsvHeader = (typeof STUDENT_MASTER_CSV_HEADERS)[number];

const HEADER_ALIASES: Record<string, StudentMasterCsvHeader> = {
  "student name": "Student Name",
  lead_name: "Student Name",
  name: "Student Name",
  "mobile number": "Mobile Number",
  phone: "Mobile Number",
  "whatsapp number": "WhatsApp Number",
  whatsapp: "WhatsApp Number",
  email: "Email",
  degree: "Degree",
  college: "College",
  college_company: "College",
  "year of passing": "Year of Passing",
  year_of_passing: "Year of Passing",
  "employment status": "Employment Status",
  employment_status: "Employment Status",
  "current salary": "Current Salary",
  current_salary: "Current Salary",
  "interested program": "Interested Program",
  interested_program: "Interested Program",
  "joining timeline": "Joining Timeline",
  joining_timeline: "Joining Timeline",
  "program budget": "Program Budget",
  budget: "Program Budget",
  "preferred batch": "Preferred Batch",
  preferred_batch: "Preferred Batch",
  "lead source": "Lead Source",
  source: "Lead Source",
  "assigned counsellor": "Assigned Counsellor",
  assigned_to: "Assigned Counsellor",
  "lead stage": "Lead Stage",
  lead_stage: "Lead Stage",
  "lead status": "Lead Status",
  status: "Lead Status",
  priority: "Priority",
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
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if ((STUDENT_MASTER_CSV_HEADERS as readonly string[]).includes(raw.trim())) {
    return raw.trim() as StudentMasterCsvHeader;
  }
  return HEADER_ALIASES[key] ?? null;
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
  return (cells[i] ?? "").trim();
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
    row.degree ?? "",
    row.college_company ?? row.company_name ?? "",
    row.year_of_passing ?? "",
    row.employment_status ?? "",
    money(row.current_salary),
    row.interested_program || row.service_interest || "",
    row.joining_timeline ?? "",
    money(row.budget),
    row.preferred_batch ?? "",
    row.source ?? "",
    counsellorLabel,
    row.lead_stage ?? "",
    row.status ?? "",
    row.priority ?? "",
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
    "B.E",
    "Sample College",
    "2024",
    "Fresher",
    "",
    "Full Stack Development",
    "Immediate",
    "50000",
    "Weekday",
    "Walk-in",
    "",
    "New Lead",
    "New",
    "Warm",
    "",
    "",
    "",
    "",
    "",
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
  degree: string | null;
  college_company: string | null;
  company_name: string | null;
  year_of_passing: string | null;
  employment_status: string | null;
  current_salary: number | null;
  interested_program: string | null;
  service_interest: string | null;
  joining_timeline: string | null;
  budget: number | null;
  preferred_batch: string | null;
  source: string | null;
  assigned_to: string | null;
  assigned_by: string;
  lead_stage: string | null;
  status: string;
  priority: string;
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

export function parseStudentMasterCsvRows(
  text: string,
  opts: {
    counsellors: { id: string; label: string; email?: string | null }[];
    currentUserId: string;
    isDbAdmin: boolean;
  },
): { payloads: StudentMasterImportPayload[]; errors: string[] } {
  const matrix = parseCsv(text);
  if (matrix.length < 2) throw new Error("CSV must include a header row and at least one data row.");

  const idx = buildStudentMasterCsvHeaderIndex(matrix[0]);
  if (!idx.has("Student Name")) {
    throw new Error('CSV must include a "Student Name" column matching the Student Master table.');
  }

  const payloads: StudentMasterImportPayload[] = [];
  const errors: string[] = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const cells = matrix[i];
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
    const college = cell(cells, idx, "College") || null;

    payloads.push({
      lead_name: studentName,
      name: studentName,
      phone,
      whatsapp: cell(cells, idx, "WhatsApp Number") || phone,
      email: email || null,
      degree: cell(cells, idx, "Degree") || null,
      college_company: college,
      company_name: college,
      year_of_passing: cell(cells, idx, "Year of Passing") || null,
      employment_status: cell(cells, idx, "Employment Status") || null,
      current_salary: numOrNull(cell(cells, idx, "Current Salary")),
      interested_program: program,
      service_interest: program,
      joining_timeline: cell(cells, idx, "Joining Timeline") || null,
      budget: numOrNull(cell(cells, idx, "Program Budget")),
      preferred_batch: cell(cells, idx, "Preferred Batch") || null,
      source: cell(cells, idx, "Lead Source") || null,
      assigned_to: opts.isDbAdmin ? resolved : opts.currentUserId,
      assigned_by: opts.currentUserId,
      lead_stage: cell(cells, idx, "Lead Stage") || null,
      status: cell(cells, idx, "Lead Status") || "New",
      priority: cell(cells, idx, "Priority") || "Warm",
      follow_up_date: cell(cells, idx, "Next Follow-up Date") || null,
      fee_quoted: numOrNull(cell(cells, idx, "Fee Quoted")),
      final_fee: numOrNull(cell(cells, idx, "Final Fee")),
      payment_status: cell(cells, idx, "Payment Status") || null,
      admission_status: cell(cells, idx, "Admission Status") || null,
    });
  }

  return { payloads, errors };
}
