import { createHash } from "crypto";
import type { CollegeVisitFormValue, CollegeVisitRow } from "@/components/college-visits/collegeVisitsHelpers";
import {
  findCollegeVisitHeaderRowIndex,
  parseCollegeVisitMatrix,
  pickCollegeVisitImportSheetName,
} from "@/components/college-visits/collegeVisitsCsv";

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
      existingByKey.set(key, `pending:${rowNumber}`);
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
