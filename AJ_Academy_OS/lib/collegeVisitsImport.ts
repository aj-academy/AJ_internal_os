import { createHash } from "crypto";
import type { CollegeVisitFormValue, CollegeVisitRow } from "@/components/college-visits/collegeVisitsHelpers";
import {
  findCollegeVisitHeaderRowIndex,
  parseCollegeVisitMatrix,
  pickCollegeVisitImportSheetName,
} from "@/components/college-visits/collegeVisitsCsv";
import { flatFieldsFromPrimary, resolveCollegeContacts } from "@/components/college-visits/collegeVisitsHelpers";

export type CollegeImportRowStatus = "pending" | "duplicate" | "invalid" | "imported" | "failed" | "skipped";

export type CollegeImportAnalyzedRow = {
  rowNumber: number;
  form: CollegeVisitFormValue;
  status: CollegeImportRowStatus;
  duplicateOf: string | null;
  errorMessage: string | null;
};

export type CollegeImportDryRunSummary = {
  rowCount: number;
  newCount: number;
  duplicateCount: number;
  invalidCount: number;
  rows: CollegeImportAnalyzedRow[];
};

function normalizeKeyPart(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Match key for duplicate detection across imports and existing rows. */
export function collegeVisitDuplicateKey(input: {
  college_name: string;
  location?: string | null;
  contact_number?: string | null;
  email?: string | null;
}): string {
  const phone = normalizeKeyPart(input.contact_number).replace(/[^\d+]/g, "");
  const email = normalizeKeyPart(input.email);
  return [
    normalizeKeyPart(input.college_name),
    normalizeKeyPart(input.location),
    phone || email || "",
  ].join("|");
}

export function hashCollegeImportBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function matrixFromUnknownRows(raw: unknown[][]): string[][] {
  return raw
    .map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? "").trim()) : []))
    .filter((row) => row.some((c) => c.length > 0));
}

function parseDelimitedText(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const firstLine = lines[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const delimiter = tabs > commas ? "\t" : ",";
  return lines.map((line) => line.split(delimiter).map((c) => c.replace(/^\uFEFF/, "").trim()));
}

export function collegeVisitBufferToMatrix(buffer: Buffer, fileName: string): string[][] {
  const name = fileName.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx") as typeof import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
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
  return parseDelimitedText(buffer.toString("utf8"));
}

export function parseCollegeVisitImportFile(
  buffer: Buffer,
  fileName: string,
  opts: {
    owners: { id: string; label: string; email?: string | null }[];
    defaultOwnerId: string;
    isDbAdmin: boolean;
  },
): { forms: CollegeVisitFormValue[]; errors: string[] } {
  const matrix = collegeVisitBufferToMatrix(buffer, fileName);
  return parseCollegeVisitMatrix(matrix, opts);
}

export function analyzeCollegeImportRows(
  forms: CollegeVisitFormValue[],
  parseErrors: string[],
  existingVisits: CollegeVisitRow[],
  headerRowIndex?: number,
): CollegeImportDryRunSummary {
  const existingByKey = new Map<string, string>();
  for (const visit of existingVisits) {
    const key = collegeVisitDuplicateKey({
      college_name: visit.college_name,
      location: visit.location,
      contact_number: visit.contact_number,
      email: visit.email,
    });
    if (key && !existingByKey.has(key)) existingByKey.set(key, visit.id);
  }

  const seenInFile = new Map<string, number>();
  const rows: CollegeImportAnalyzedRow[] = [];
  let rowNumber = (headerRowIndex ?? 0) + 2;

  for (const form of forms) {
    const key = collegeVisitDuplicateKey({
      college_name: form.college_name,
      location: form.location,
      contact_number: form.contact_number,
      email: form.email,
    });

    if (seenInFile.has(key)) {
      rows.push({
        rowNumber,
        form,
        status: "duplicate",
        duplicateOf: existingByKey.get(key) ?? null,
        errorMessage: `Duplicate row in this file (same as row ${seenInFile.get(key)}).`,
      });
      rowNumber += 1;
      continue;
    }
    seenInFile.set(key, rowNumber);

    const duplicateOf = existingByKey.get(key) ?? null;
    if (duplicateOf) {
      rows.push({
        rowNumber,
        form,
        status: "duplicate",
        duplicateOf,
        errorMessage: "Already exists in College Visits.",
      });
    } else {
      rows.push({
        rowNumber,
        form,
        status: "pending",
        duplicateOf: null,
        errorMessage: null,
      });
    }
    rowNumber += 1;
  }

  const duplicateCount = rows.filter((r) => r.status === "duplicate").length;
  const invalidCount = parseErrors.length;
  const newCount = rows.filter((r) => r.status === "pending").length;

  return {
    rowCount: rows.length,
    newCount,
    duplicateCount,
    invalidCount,
    rows,
  };
}

export const COLLEGE_IMPORT_EXECUTE_CHUNK = 75;

export type CollegeImportStagingRow = {
  id: string;
  row_number: number;
  payload: CollegeVisitFormValue;
  status: string;
  duplicate_of?: string | null;
  error_message?: string | null;
};

/** Preview row for the import table before execute saves to college_visits. */
export function stagingImportRowToVisit(
  row: CollegeImportStagingRow,
  batchId: string,
): CollegeVisitRow {
  const form = row.payload;
  const contacts = resolveCollegeContacts({
    contacts: form.contacts,
    contact_number: form.contact_number,
    email: form.email,
    connected_person_name: form.connected_person_name,
    connected_person_role: form.connected_person_role,
  });
  const flat = flatFieldsFromPrimary(contacts);
  const now = new Date().toISOString();
  return {
    id: `staging:${row.id}`,
    college_name: form.college_name,
    location: form.location?.trim() || null,
    contact_number: flat.contact_number,
    email: flat.email,
    connected_person_name: flat.connected_person_name,
    connected_person_role: flat.connected_person_role,
    contacts,
    visit_status: form.visit_status || "Not Visited",
    visited_by_name: form.visited_by_name?.trim() || null,
    visit_date: form.visit_date || null,
    visited_by: form.visited_by?.trim() || null,
    mou_signed_status: form.mou_signed_status || "Not Signed",
    follow_up_stage: form.follow_up_stage?.trim() || null,
    last_follow_up_date: form.last_follow_up_date || null,
    next_follow_up_date: form.next_follow_up_date || null,
    priority: form.priority || "Warm",
    assigned_to: form.assigned_to?.trim() || null,
    assigned_by: null,
    description: form.description?.trim() || null,
    last_outcome_remarks: form.last_outcome_remarks?.trim() || null,
    lead_score: Number(form.lead_score) || 0,
    final_status: form.final_status || "Open",
    source_reference:
      row.status === "duplicate"
        ? `[Duplicate preview] ${form.source_reference?.trim() || ""}`.trim()
        : form.source_reference?.trim() || null,
    proposal_status: form.proposal_status || "Not Sent",
    proposal_amount: null,
    proposal_sent_date: null,
    proposal_link: null,
    proposal_pdf_url: null,
    proposal_pdf_name: null,
    proposal_file_name: null,
    proposal_file_path: null,
    proposal_file_type: null,
    proposal_file_size: null,
    proposal_uploaded_at: null,
    import_batch_id: batchId,
    created_by: null,
    created_at: now,
    updated_at: now,
  };
}
