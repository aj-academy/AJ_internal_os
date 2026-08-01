/**
 * Phase 4–6 — row validation + dry-run classification for portal student import.
 */

import {
  ADMISSION_TYPE_VALUES,
  GENDER_VALUES,
  SEMESTER_VALUES,
  STUDENT_STATUS_VALUES,
  YEAR_OF_STUDY_VALUES,
} from "@/lib/students/importTemplate";
import type { ColumnMapping } from "@/lib/students/importMapping";
import { applyMappingToRow } from "@/lib/students/importMapping";

export type ImportMode =
  | "create_only"
  | "update_only"
  | "create_and_update"
  | "skip_duplicates"
  | "stop_on_error"
  | "import_valid_skip_invalid";

export type RowIssue = {
  severity: "error" | "warning";
  column?: string;
  message: string;
  expected?: string;
  value?: string;
};

export type ValidatedImportRow = {
  rowNumber: number;
  raw: Record<string, string>;
  mapped: Record<string, string>;
  severity: "valid" | "warning" | "error";
  issues: RowIssue[];
  action: "create" | "update" | "skip" | "blocked";
  idempotencyKey: string;
  existingProfileId?: string | null;
};

export type CatalogLookup = {
  departmentsByName: Map<string, { id: string; name: string }>;
  coursesByKey: Map<string, { id: string; name: string; department_id: string }>;
  batchesByKey: Map<string, { id: string; name: string; course_id: string; academic_year: string | null }>;
  academicYears: Set<string>;
};

export type ExistingStudentIndex = {
  byEmail: Map<string, { id: string; registration_number: string | null; phone: string | null }>;
  byRegistration: Map<string, { id: string; email: string | null }>;
  byPhone: Map<string, { id: string; email: string | null }>;
};

function nkey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^\+?[0-9]{10,15}$/;
const REG_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/]{1,63}$/;

function parseDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function buildCatalogLookup(input: {
  departments: { id: string; name: string; status?: string | null }[];
  courses: { id: string; name: string; department_id: string; status?: string | null }[];
  batches: {
    id: string;
    name: string;
    course_id: string;
    academic_year?: string | null;
    status?: string | null;
  }[];
}): CatalogLookup {
  const departmentsByName = new Map<string, { id: string; name: string }>();
  for (const d of input.departments) {
    if (d.status && String(d.status).toLowerCase() !== "active") continue;
    departmentsByName.set(nkey(d.name), { id: d.id, name: d.name });
  }
  const coursesByKey = new Map<string, { id: string; name: string; department_id: string }>();
  for (const c of input.courses) {
    if (c.status && String(c.status).toLowerCase() !== "active") continue;
    coursesByKey.set(`${c.department_id}::${nkey(c.name)}`, {
      id: c.id,
      name: c.name,
      department_id: c.department_id,
    });
    coursesByKey.set(`*::${nkey(c.name)}`, {
      id: c.id,
      name: c.name,
      department_id: c.department_id,
    });
  }
  const batchesByKey = new Map<
    string,
    { id: string; name: string; course_id: string; academic_year: string | null }
  >();
  const academicYears = new Set<string>();
  for (const b of input.batches) {
    if (b.status && String(b.status).toLowerCase() !== "active") continue;
    batchesByKey.set(`${b.course_id}::${nkey(b.name)}`, {
      id: b.id,
      name: b.name,
      course_id: b.course_id,
      academic_year: b.academic_year ?? null,
    });
    if (b.academic_year?.trim()) academicYears.add(b.academic_year.trim());
  }
  return { departmentsByName, coursesByKey, batchesByKey, academicYears };
}

export function validateImportRows(args: {
  rows: Record<string, string>[];
  mapping: ColumnMapping;
  catalog: CatalogLookup;
  existing: ExistingStudentIndex;
  mode: ImportMode;
  organizationKey?: string;
}): {
  validated: ValidatedImportRow[];
  summary: {
    total: number;
    valid: number;
    warning: number;
    error: number;
    duplicate: number;
    create: number;
    update: number;
    skip: number;
    blocked: number;
    byDepartment: Record<string, number>;
    byCourse: Record<string, number>;
    byBatch: Record<string, number>;
  };
} {
  const { rows, mapping, catalog, existing, mode } = args;
  const org = args.organizationKey || "aj";
  const fileEmails = new Map<string, number>();
  const fileMobiles = new Map<string, number>();
  const fileRegs = new Map<string, number>();

  const validated: ValidatedImportRow[] = [];

  rows.forEach((raw, idx) => {
    const rowNumber = idx + 2; // 1-based sheet row with header
    const mapped = applyMappingToRow(raw, mapping);
    const issues: RowIssue[] = [];

    const reg = mapped["Registration Number"];
    const first = mapped["First Name"];
    const last = mapped["Last Name"];
    const email = mapped["Email"].toLowerCase();
    const mobile = mapped["Mobile Number"].replace(/[\s\-()]/g, "");
    const deptName = mapped["Department"];
    const courseName = mapped["Course"];
    const batchName = mapped["Batch"];
    const academicYear = mapped["Academic Year"];
    const yearOfStudy = mapped["Year of Study"];
    const semester = mapped["Semester"];
    const admissionDate = mapped["Admission Date"];
    const status = mapped["Student Status"];

    const requiredPairs: [string, string][] = [
      ["Registration Number", reg],
      ["First Name", first],
      ["Last Name", last],
      ["Email", email],
      ["Mobile Number", mobile],
      ["Department", deptName],
      ["Course", courseName],
      ["Batch", batchName],
      ["Academic Year", academicYear],
      ["Year of Study", yearOfStudy],
      ["Semester", semester],
      ["Admission Date", admissionDate],
      ["Student Status", status],
    ];
    for (const [col, val] of requiredPairs) {
      if (!val) {
        issues.push({ severity: "error", column: col, message: `${col} is required.`, value: val });
      }
    }

    if (email && !EMAIL_RE.test(email)) {
      issues.push({
        severity: "error",
        column: "Email",
        message: "Invalid email format.",
        value: email,
        expected: "name@domain.com",
      });
    }
    if (mobile && !MOBILE_RE.test(mobile)) {
      issues.push({
        severity: "error",
        column: "Mobile Number",
        message: "Invalid mobile format (10–15 digits, optional +).",
        value: mobile,
      });
    }
    if (reg && !REG_RE.test(reg)) {
      issues.push({
        severity: "error",
        column: "Registration Number",
        message: "Invalid registration number characters or length.",
        value: reg,
      });
    }

    const adm = admissionDate ? parseDate(admissionDate) : null;
    if (admissionDate && !adm) {
      issues.push({
        severity: "error",
        column: "Admission Date",
        message: "Invalid date. Use YYYY-MM-DD.",
        value: admissionDate,
      });
    } else if (adm) {
      mapped["Admission Date"] = adm;
    }

    const dob = mapped["Date of Birth"];
    if (dob) {
      const parsedDob = parseDate(dob);
      if (!parsedDob) {
        issues.push({
          severity: "error",
          column: "Date of Birth",
          message: "Invalid date. Use YYYY-MM-DD.",
          value: dob,
        });
      } else mapped["Date of Birth"] = parsedDob;
    }

    if (status && !STUDENT_STATUS_VALUES.map((s) => s.toLowerCase()).includes(status.toLowerCase())) {
      issues.push({
        severity: "error",
        column: "Student Status",
        message: "Invalid student status.",
        value: status,
        expected: STUDENT_STATUS_VALUES.join(", "),
      });
    }
    if (yearOfStudy && !YEAR_OF_STUDY_VALUES.includes(yearOfStudy as (typeof YEAR_OF_STUDY_VALUES)[number])) {
      issues.push({
        severity: "error",
        column: "Year of Study",
        message: "Invalid year of study.",
        value: yearOfStudy,
        expected: YEAR_OF_STUDY_VALUES.join(", "),
      });
    }
    if (semester && !SEMESTER_VALUES.includes(semester as (typeof SEMESTER_VALUES)[number])) {
      issues.push({
        severity: "error",
        column: "Semester",
        message: "Invalid semester.",
        value: semester,
        expected: SEMESTER_VALUES.join(", "),
      });
    }
    const gender = mapped["Gender"];
    if (gender && !GENDER_VALUES.map((g) => g.toLowerCase()).includes(gender.toLowerCase())) {
      issues.push({
        severity: "warning",
        column: "Gender",
        message: "Unrecognized gender value.",
        value: gender,
      });
    }
    const admType = mapped["Admission Type"];
    if (
      admType &&
      !ADMISSION_TYPE_VALUES.map((a) => a.toLowerCase()).includes(admType.toLowerCase())
    ) {
      issues.push({
        severity: "warning",
        column: "Admission Type",
        message: "Unrecognized admission type.",
        value: admType,
      });
    }

    for (const [col, val] of Object.entries(mapped)) {
      if (val.length > 500) {
        issues.push({
          severity: "error",
          column: col,
          message: "Value exceeds 500 characters.",
        });
      }
      if (/[<>]/.test(val)) {
        issues.push({
          severity: "warning",
          column: col,
          message: "Value contains unsupported symbols (< or >).",
          value: val,
        });
      }
    }

    const dept = deptName ? catalog.departmentsByName.get(nkey(deptName)) : undefined;
    if (deptName && !dept) {
      issues.push({
        severity: "error",
        column: "Department",
        message: "Department does not exist.",
        value: deptName,
      });
    }

    let course =
      dept && courseName
        ? catalog.coursesByKey.get(`${dept.id}::${nkey(courseName)}`)
        : undefined;
    if (!course && courseName) {
      const loose = catalog.coursesByKey.get(`*::${nkey(courseName)}`);
      if (loose && dept && loose.department_id !== dept.id) {
        issues.push({
          severity: "error",
          column: "Course",
          message: "Course does not belong to the selected department.",
          value: courseName,
        });
      } else if (!loose) {
        issues.push({
          severity: "error",
          column: "Course",
          message: "Course does not exist.",
          value: courseName,
        });
      } else course = loose;
    } else if (courseName && dept && !course) {
      issues.push({
        severity: "error",
        column: "Course",
        message: "Course does not exist for this department.",
        value: courseName,
      });
    }

    let batch =
      course && batchName
        ? catalog.batchesByKey.get(`${course.id}::${nkey(batchName)}`)
        : undefined;
    if (batchName && course && !batch) {
      issues.push({
        severity: "error",
        column: "Batch",
        message: "Batch does not belong to the selected course (or does not exist).",
        value: batchName,
      });
    }

    if (
      academicYear &&
      catalog.academicYears.size > 0 &&
      !catalog.academicYears.has(academicYear) &&
      batch?.academic_year &&
      batch.academic_year !== academicYear
    ) {
      issues.push({
        severity: "warning",
        column: "Academic Year",
        message: "Academic year does not match catalog / batch year.",
        value: academicYear,
        expected: batch.academic_year,
      });
    }

    // In-file duplicates
    if (email) {
      if (fileEmails.has(email)) {
        issues.push({
          severity: "error",
          column: "Email",
          message: `Duplicate email in file (also row ${fileEmails.get(email)}).`,
          value: email,
        });
      } else fileEmails.set(email, rowNumber);
    }
    if (mobile) {
      if (fileMobiles.has(mobile)) {
        issues.push({
          severity: "error",
          column: "Mobile Number",
          message: `Duplicate mobile in file (also row ${fileMobiles.get(mobile)}).`,
          value: mobile,
        });
      } else fileMobiles.set(mobile, rowNumber);
    }
    if (reg) {
      const rk = nkey(reg);
      if (fileRegs.has(rk)) {
        issues.push({
          severity: "error",
          column: "Registration Number",
          message: `Duplicate registration number in file (also row ${fileRegs.get(rk)}).`,
          value: reg,
        });
      } else fileRegs.set(rk, rowNumber);
    }

    const existingByEmail = email ? existing.byEmail.get(email) : undefined;
    const existingByReg = reg ? existing.byRegistration.get(nkey(reg)) : undefined;
    const existingByPhone = mobile ? existing.byPhone.get(mobile) : undefined;

    if (existingByEmail) {
      issues.push({
        severity: "warning",
        column: "Email",
        message: "Student email already exists and may be updated.",
        value: email,
      });
    }
    if (existingByPhone && (!existingByEmail || existingByPhone.id !== existingByEmail.id)) {
      issues.push({
        severity: "warning",
        column: "Mobile Number",
        message: "Mobile number belongs to an existing student.",
        value: mobile,
      });
    }
    if (existingByReg && (!existingByEmail || existingByReg.id !== existingByEmail.id)) {
      issues.push({
        severity: "warning",
        column: "Registration Number",
        message: "Registration number already exists in the database.",
        value: reg,
      });
    }

    const existingId = existingByReg?.id || existingByEmail?.id || null;
    const hasError = issues.some((i) => i.severity === "error");
    const hasWarning = issues.some((i) => i.severity === "warning");
    const severity: ValidatedImportRow["severity"] = hasError
      ? "error"
      : hasWarning
        ? "warning"
        : "valid";

    let action: ValidatedImportRow["action"] = "create";
    if (hasError) {
      action = mode === "stop_on_error" || mode === "import_valid_skip_invalid" ? "blocked" : "blocked";
    } else if (existingId) {
      if (mode === "create_only" || mode === "skip_duplicates") action = "skip";
      else if (mode === "update_only" || mode === "create_and_update") action = "update";
      else action = "skip";
    } else {
      if (mode === "update_only") action = "skip";
      else action = "create";
    }

    const idempotencyKey = `${org}|${nkey(reg || email || `row-${rowNumber}`)}|${nkey(academicYear || "")}`;

    validated.push({
      rowNumber,
      raw,
      mapped,
      severity,
      issues,
      action,
      idempotencyKey,
      existingProfileId: existingId,
    });
  });

  const summary = {
    total: validated.length,
    valid: validated.filter((r) => r.severity === "valid").length,
    warning: validated.filter((r) => r.severity === "warning").length,
    error: validated.filter((r) => r.severity === "error").length,
    duplicate: validated.filter((r) =>
      r.issues.some((i) => i.message.toLowerCase().includes("duplicate")),
    ).length,
    create: validated.filter((r) => r.action === "create").length,
    update: validated.filter((r) => r.action === "update").length,
    skip: validated.filter((r) => r.action === "skip").length,
    blocked: validated.filter((r) => r.action === "blocked").length,
    byDepartment: {} as Record<string, number>,
    byCourse: {} as Record<string, number>,
    byBatch: {} as Record<string, number>,
  };

  for (const r of validated) {
    const d = r.mapped["Department"] || "—";
    const c = r.mapped["Course"] || "—";
    const b = r.mapped["Batch"] || "—";
    summary.byDepartment[d] = (summary.byDepartment[d] || 0) + 1;
    summary.byCourse[c] = (summary.byCourse[c] || 0) + 1;
    summary.byBatch[b] = (summary.byBatch[b] || 0) + 1;
  }

  return { validated, summary };
}

export function mapStatusToProfile(status: string): "active" | "inactive" {
  const s = status.trim().toLowerCase();
  if (s === "active") return "active";
  return "inactive";
}

export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  let out = "Aj!";
  for (let i = 0; i < 12; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}
