/**
 * Portal student bulk-import template (Phase 1).
 * Excel: Students + Instructions + Valid Values (live catalog).
 * CSV: header + example row; version in filename / Instructions text for Excel.
 */

import * as XLSX from "xlsx";
import { buildCsv } from "@/lib/csv";

export const STUDENT_IMPORT_TEMPLATE_VERSION = "1.0.0";

/** Max data rows recommended / hard limit per upload (excluding header). */
export const STUDENT_IMPORT_MAX_ROWS_RECOMMENDED = 500;

/** Hard upload size limit (5 MiB). */
export const STUDENT_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;

export const STUDENT_IMPORT_REQUIRED_COLUMNS = [
  "Registration Number",
  "First Name",
  "Last Name",
  "Email",
  "Mobile Number",
  "Department",
  "Course",
  "Batch",
  "Academic Year",
  "Year of Study",
  "Semester",
  "Admission Date",
  "Student Status",
] as const;

export const STUDENT_IMPORT_OPTIONAL_COLUMNS = [
  "Date of Birth",
  "Gender",
  "Alternate Mobile Number",
  "Parent/Guardian Name",
  "Parent/Guardian Mobile",
  "Address",
  "City",
  "State",
  "Postal Code",
  "College Name",
  "Roll Number",
  "Section",
  "Admission Type",
  "Scholarship Type",
  "LinkedIn URL",
  "GitHub URL",
  "Portfolio URL",
  "Notes",
] as const;

export type StudentImportRequiredColumn = (typeof STUDENT_IMPORT_REQUIRED_COLUMNS)[number];
export type StudentImportOptionalColumn = (typeof STUDENT_IMPORT_OPTIONAL_COLUMNS)[number];
export type StudentImportColumn = StudentImportRequiredColumn | StudentImportOptionalColumn;

export const STUDENT_IMPORT_ALL_COLUMNS: StudentImportColumn[] = [
  ...STUDENT_IMPORT_REQUIRED_COLUMNS,
  ...STUDENT_IMPORT_OPTIONAL_COLUMNS,
];

export const STUDENT_STATUS_VALUES = [
  "Active",
  "Inactive",
  "Graduated",
  "Suspended",
  "Withdrawn",
] as const;

export const YEAR_OF_STUDY_VALUES = ["1", "2", "3", "4"] as const;
export const SEMESTER_VALUES = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;
export const SECTION_VALUES = ["A", "B", "C", "D", "E"] as const;
export const GENDER_VALUES = ["Male", "Female", "Other", "Prefer not to say"] as const;
export const ADMISSION_TYPE_VALUES = [
  "Regular",
  "Lateral",
  "Transfer",
  "Management",
  "Scholarship",
] as const;

export type CatalogDepartment = { id: string; name: string; status?: string | null };
export type CatalogCourse = {
  id: string;
  name: string;
  department_id: string;
  status?: string | null;
};
export type CatalogBatch = {
  id: string;
  name: string;
  course_id: string;
  academic_year?: string | null;
  status?: string | null;
};

export type StudentImportCatalog = {
  departments: CatalogDepartment[];
  courses: CatalogCourse[];
  batches: CatalogBatch[];
  generatedAt: string;
};

function deptName(map: Map<string, string>, id: string): string {
  return map.get(id) ?? "";
}

function courseName(map: Map<string, string>, id: string): string {
  return map.get(id) ?? "";
}

function activeOnly<T extends { status?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !r.status || String(r.status).toLowerCase() === "active");
}

export function resolveAcademicYears(batches: CatalogBatch[]): string[] {
  const set = new Set<string>();
  for (const b of batches) {
    const y = (b.academic_year ?? "").trim();
    if (y) set.add(y);
  }
  if (set.size === 0) {
    const y = new Date().getFullYear();
    set.add(`${y}-${y + 1}`);
    set.add(`${y - 1}-${y}`);
  }
  return Array.from(set).sort();
}

export function buildExampleStudentRow(catalog: StudentImportCatalog): Record<StudentImportColumn, string> {
  const departments = activeOnly(catalog.departments);
  const courses = activeOnly(catalog.courses);
  const batches = activeOnly(catalog.batches);
  const dept = departments[0];
  const course = dept ? courses.find((c) => c.department_id === dept.id) ?? courses[0] : courses[0];
  const batch = course ? batches.find((b) => b.course_id === course.id) ?? batches[0] : batches[0];
  const years = resolveAcademicYears(batches);
  const today = new Date().toISOString().slice(0, 10);

  const row = {} as Record<StudentImportColumn, string>;
  for (const col of STUDENT_IMPORT_ALL_COLUMNS) row[col] = "";

  row["Registration Number"] = "AJ-2026-0001";
  row["First Name"] = "Ada";
  row["Last Name"] = "Lovelace";
  row["Email"] = "ada.lovelace.example@ajacademy.local";
  row["Mobile Number"] = "9876543210";
  row["Department"] = dept?.name ?? "Engineering";
  row["Course"] = course?.name ?? "Full Stack Development";
  row["Batch"] = batch?.name ?? "Batch A";
  row["Academic Year"] = batch?.academic_year?.trim() || years[0] || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
  row["Year of Study"] = "1";
  row["Semester"] = "1";
  row["Admission Date"] = today;
  row["Student Status"] = "Active";
  row["Gender"] = "Female";
  row["Section"] = "A";
  row["Admission Type"] = "Regular";
  row["Notes"] = "EXAMPLE ROW — replace or delete before import";
  return row;
}

function headerRow(): string[] {
  return STUDENT_IMPORT_ALL_COLUMNS.map((col) =>
    (STUDENT_IMPORT_REQUIRED_COLUMNS as readonly string[]).includes(col) ? `* ${col}` : col,
  );
}

function exampleValues(catalog: StudentImportCatalog): string[] {
  const example = buildExampleStudentRow(catalog);
  return STUDENT_IMPORT_ALL_COLUMNS.map((col) => example[col]);
}

function instructionsAoA(catalog: StudentImportCatalog): (string | number)[][] {
  const generated = catalog.generatedAt;
  return [
    ["AJ Academy OS — Portal Student Import Template"],
    ["Template Version", STUDENT_IMPORT_TEMPLATE_VERSION],
    ["Generated At (UTC)", generated],
    ["Maximum recommended data rows", STUDENT_IMPORT_MAX_ROWS_RECOMMENDED],
    [],
    ["How to use"],
    ["1. Fill the Students sheet. Keep the header row exactly as generated (* marks required columns)."],
    ["2. Use names from the Valid Values sheet for Department, Course, Batch, Academic Year, Student Status, etc."],
    ["3. Course must belong to the named Department; Batch must belong to the named Course."],
    ["4. Delete the example row before importing real students."],
    ["5. Save as .xlsx (preferred) or export Students sheet as CSV."],
    ["6. Do not put passwords in this file. Accounts are created by the secure server import (later phases)."],
    [],
    ["Formats"],
    ["Email", "Valid email address, e.g. student@college.edu"],
    ["Mobile Number", "10–15 digits; optional leading +country code. Example: 9876543210 or +919876543210"],
    ["Dates", "ISO format YYYY-MM-DD (e.g. 2026-08-01). Excel date cells are also accepted."],
    ["Registration Number", "Stable student ID unique in AJ OS. Prefer letters, digits, hyphen."],
    [],
    ["Required columns (* prefix on Students sheet)"],
    ...STUDENT_IMPORT_REQUIRED_COLUMNS.map((c) => [c]),
    [],
    ["Optional columns"],
    ...STUDENT_IMPORT_OPTIONAL_COLUMNS.map((c) => [c]),
    [],
    ["Do not include"],
    ["Passwords, OTP secrets, bank details, Aadhaar/PAN, or other sensitive IDs unless already required by policy."],
    [],
    ["Template version validation"],
    ["Keep Template Version on this sheet. Upload must match a supported version (currently " + STUDENT_IMPORT_TEMPLATE_VERSION + ")."],
  ];
}

function validValuesAoA(catalog: StudentImportCatalog): (string | number)[][] {
  const departments = activeOnly(catalog.departments);
  const courses = activeOnly(catalog.courses);
  const batches = activeOnly(catalog.batches);
  const deptById = new Map(departments.map((d) => [d.id, d.name]));
  const courseById = new Map(courses.map((c) => [c.id, c.name]));
  const years = resolveAcademicYears(batches);

  const maxRows = Math.max(
    departments.length,
    courses.length,
    batches.length,
    years.length,
    STUDENT_STATUS_VALUES.length,
    YEAR_OF_STUDY_VALUES.length,
    SEMESTER_VALUES.length,
    SECTION_VALUES.length,
    GENDER_VALUES.length,
    ADMISSION_TYPE_VALUES.length,
    1,
  );

  const header = [
    "Department",
    "Course",
    "Course Department",
    "Batch",
    "Batch Course",
    "Academic Year",
    "Student Status",
    "Year of Study",
    "Semester",
    "Section",
    "Gender",
    "Admission Type",
  ];

  const rows: (string | number)[][] = [header];
  for (let i = 0; i < maxRows; i += 1) {
    const course = courses[i];
    const batch = batches[i];
    rows.push([
      departments[i]?.name ?? "",
      course?.name ?? "",
      course ? deptName(deptById, course.department_id) : "",
      batch?.name ?? "",
      batch ? courseName(courseById, batch.course_id) : "",
      years[i] ?? "",
      STUDENT_STATUS_VALUES[i] ?? "",
      YEAR_OF_STUDY_VALUES[i] ?? "",
      SEMESTER_VALUES[i] ?? "",
      SECTION_VALUES[i] ?? "",
      GENDER_VALUES[i] ?? "",
      ADMISSION_TYPE_VALUES[i] ?? "",
    ]);
  }
  return rows;
}

/** Build .xlsx workbook buffer (Node). */
export function buildStudentImportXlsxBuffer(catalog: StudentImportCatalog): Buffer {
  const wb = XLSX.utils.book_new();

  const studentsAoA: (string | number)[][] = [headerRow(), exampleValues(catalog)];
  const studentsSheet = XLSX.utils.aoa_to_sheet(studentsAoA);
  studentsSheet["!cols"] = STUDENT_IMPORT_ALL_COLUMNS.map((col) => ({
    wch: Math.min(28, Math.max(14, col.length + 2)),
  }));
  XLSX.utils.book_append_sheet(wb, studentsSheet, "Students");

  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsAoA(catalog));
  instructionsSheet["!cols"] = [{ wch: 28 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, instructionsSheet, "Instructions");

  const validSheet = XLSX.utils.aoa_to_sheet(validValuesAoA(catalog));
  validSheet["!cols"] = Array.from({ length: 12 }, () => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, validSheet, "Valid Values");

  // Community SheetJS does not reliably persist Excel data-validation dropdowns;
  // Valid Values sheet is the source of truth for allowed names.
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

/** CSV of Students sheet only (headers + example). Version carried in filename. */
export function buildStudentImportCsv(catalog: StudentImportCatalog): string {
  return buildCsv(headerRow(), [exampleValues(catalog)]);
}

export function studentImportXlsxFilename(generatedAtIso: string): string {
  const day = generatedAtIso.slice(0, 10);
  return `AJ_Student_Import_Template_v${STUDENT_IMPORT_TEMPLATE_VERSION}_${day}.xlsx`;
}

export function studentImportCsvFilename(generatedAtIso: string): string {
  const day = generatedAtIso.slice(0, 10);
  return `AJ_Student_Import_Template_v${STUDENT_IMPORT_TEMPLATE_VERSION}_${day}.csv`;
}
