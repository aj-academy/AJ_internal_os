/**
 * Phase 3 — column mapping for portal student import.
 */

import {
  STUDENT_IMPORT_ALL_COLUMNS,
  STUDENT_IMPORT_REQUIRED_COLUMNS,
  type StudentImportColumn,
} from "@/lib/students/importTemplate";

export type ColumnMapping = Partial<Record<StudentImportColumn, string | null>>;

export type MappingAnalysis = {
  autoMapping: ColumnMapping;
  ambiguous: { target: StudentImportColumn; candidates: string[] }[];
  missingRequired: StudentImportColumn[];
  unknownHeaders: string[];
  confirmed: boolean;
};

const ALIASES: Record<string, StudentImportColumn> = {
  "registration number": "Registration Number",
  "student id": "Registration Number",
  "reg no": "Registration Number",
  "reg. no": "Registration Number",
  "registration no": "Registration Number",
  "registration no.": "Registration Number",
  roll: "Roll Number",
  "roll no": "Roll Number",
  "roll number": "Roll Number",
  "roll no.": "Roll Number",
  "first name": "First Name",
  "last name": "Last Name",
  "given name": "First Name",
  surname: "Last Name",
  email: "Email",
  "email address": "Email",
  "e-mail": "Email",
  mobile: "Mobile Number",
  phone: "Mobile Number",
  "mobile number": "Mobile Number",
  "phone number": "Mobile Number",
  "contact number": "Mobile Number",
  department: "Department",
  "department name": "Department",
  course: "Course",
  "course name": "Course",
  program: "Course",
  batch: "Batch",
  "batch name": "Batch",
  class: "Batch",
  "academic year": "Academic Year",
  "year of study": "Year of Study",
  year: "Year of Study",
  semester: "Semester",
  "admission date": "Admission Date",
  "date of admission": "Admission Date",
  "student status": "Student Status",
  status: "Student Status",
  "date of birth": "Date of Birth",
  dob: "Date of Birth",
  gender: "Gender",
  "alternate mobile number": "Alternate Mobile Number",
  "alternate mobile": "Alternate Mobile Number",
  "parent/guardian name": "Parent/Guardian Name",
  "parent name": "Parent/Guardian Name",
  "guardian name": "Parent/Guardian Name",
  "parent/guardian mobile": "Parent/Guardian Mobile",
  "parent mobile": "Parent/Guardian Mobile",
  address: "Address",
  city: "City",
  state: "State",
  "postal code": "Postal Code",
  pincode: "Postal Code",
  "college name": "College Name",
  college: "College Name",
  section: "Section",
  "admission type": "Admission Type",
  "scholarship type": "Scholarship Type",
  "linkedin url": "LinkedIn URL",
  linkedin: "LinkedIn URL",
  "github url": "GitHub URL",
  github: "GitHub URL",
  "portfolio url": "Portfolio URL",
  portfolio: "Portfolio URL",
  notes: "Notes",
};

/** Ambiguous aliases — require admin confirmation (never auto-map alone). */
const AMBIGUOUS_ALIASES: Record<string, StudentImportColumn[]> = {
  name: ["First Name", "Last Name"],
  "student name": ["First Name", "Last Name"],
  "full name": ["First Name", "Last Name"],
};

function norm(h: string): string {
  return h
    .replace(/^\*\s*/, "")
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ");
}

export function analyzeColumnMapping(headers: string[]): MappingAnalysis {
  const autoMapping: ColumnMapping = {};
  const ambiguous: MappingAnalysis["ambiguous"] = [];
  const usedHeaders = new Set<string>();
  const unknownHeaders: string[] = [];

  for (const col of STUDENT_IMPORT_ALL_COLUMNS) {
    autoMapping[col] = null;
  }

  // Exact / alias matches (non-ambiguous)
  for (const header of headers) {
    const key = norm(header);
    if (AMBIGUOUS_ALIASES[key]) {
      ambiguous.push({ target: AMBIGUOUS_ALIASES[key][0], candidates: [header] });
      // Also note for Last Name pair
      if (AMBIGUOUS_ALIASES[key].includes("Last Name")) {
        ambiguous.push({ target: "Last Name", candidates: [header] });
      }
      continue;
    }
    const exact = STUDENT_IMPORT_ALL_COLUMNS.find((c) => norm(c) === key);
    const aliased = ALIASES[key];
    const target = exact ?? aliased;
    if (!target) {
      unknownHeaders.push(header);
      continue;
    }
    if (autoMapping[target]) {
      // already mapped — treat as ambiguous
      ambiguous.push({
        target,
        candidates: [autoMapping[target] as string, header],
      });
      autoMapping[target] = null;
      continue;
    }
    autoMapping[target] = header;
    usedHeaders.add(header);
  }

  // Deduplicate ambiguous entries by target
  const ambMap = new Map<StudentImportColumn, Set<string>>();
  for (const a of ambiguous) {
    const set = ambMap.get(a.target) ?? new Set<string>();
    a.candidates.forEach((c) => set.add(c));
    ambMap.set(a.target, set);
  }
  const ambiguousDedup = Array.from(ambMap.entries()).map(([target, set]) => ({
    target,
    candidates: Array.from(set),
  }));

  const missingRequired = STUDENT_IMPORT_REQUIRED_COLUMNS.filter((c) => !autoMapping[c]);

  // Ambiguous full-name style: missing First/Last but have ambiguous candidates
  const confirmed =
    missingRequired.length === 0 &&
    ambiguousDedup.every((a) => autoMapping[a.target] != null);

  return {
    autoMapping,
    ambiguous: ambiguousDedup.filter((a) => !autoMapping[a.target]),
    missingRequired: STUDENT_IMPORT_REQUIRED_COLUMNS.filter((c) => !autoMapping[c]),
    unknownHeaders: unknownHeaders.filter((h) => !usedHeaders.has(h)),
    confirmed: false,
  };
}

export function validateManualMapping(mapping: ColumnMapping): {
  ok: boolean;
  missingRequired: StudentImportColumn[];
  errors: string[];
} {
  const missingRequired = STUDENT_IMPORT_REQUIRED_COLUMNS.filter((c) => !mapping[c]);
  const errors: string[] = [];
  if (missingRequired.length) {
    errors.push(`Missing required mappings: ${missingRequired.join(", ")}`);
  }
  const seen = new Map<string, StudentImportColumn>();
  for (const col of STUDENT_IMPORT_ALL_COLUMNS) {
    const h = mapping[col];
    if (!h) continue;
    const prev = seen.get(h);
    if (prev && prev !== col) {
      errors.push(`Header "${h}" is mapped to both ${prev} and ${col}.`);
    }
    seen.set(h, col);
  }
  return { ok: errors.length === 0, missingRequired, errors };
}

export function applyMappingToRow(
  raw: Record<string, string>,
  mapping: ColumnMapping,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of STUDENT_IMPORT_ALL_COLUMNS) {
    const header = mapping[col];
    if (!header) {
      out[col] = "";
      continue;
    }
    out[col] = String(raw[header] ?? "").trim();
  }
  return out;
}
