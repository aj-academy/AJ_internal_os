/**
 * Phase 2 — portal student import file validation & light parse (row count + template version).
 * Column mapping is Phase 3.
 */

import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { parseCsv } from "@/lib/csv";
import {
  STUDENT_IMPORT_MAX_FILE_BYTES,
  STUDENT_IMPORT_MAX_ROWS_RECOMMENDED,
  STUDENT_IMPORT_TEMPLATE_VERSION,
} from "@/lib/students/importTemplate";

export const STUDENT_IMPORTS_BUCKET = "student-imports";

/** Hard data-row limit (excludes header). */
export const STUDENT_IMPORT_MAX_DATA_ROWS = STUDENT_IMPORT_MAX_ROWS_RECOMMENDED;

export { STUDENT_IMPORT_MAX_FILE_BYTES };

export const STUDENT_IMPORT_SUPPORTED_EXTENSIONS = [".xlsx", ".csv"] as const;
/** .xls is readable by SheetJS but discouraged; rejected unless explicitly enabled. */
export const STUDENT_IMPORT_ALLOW_XLS = false;

const ALLOWED_MIME = new Set([
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);

if (STUDENT_IMPORT_ALLOW_XLS) {
  ALLOWED_MIME.add("application/vnd.ms-excel");
}

export type StudentImportUploadParseResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  extension: ".xlsx" | ".xls" | ".csv" | null;
  mime: string;
  fileHash: string;
  templateVersion: string | null;
  templateVersionOk: boolean;
  headers: string[];
  dataRowCount: number;
  sheetNames: string[];
};

function normalizeHeader(cell: unknown): string {
  return String(cell ?? "")
    .replace(/^\*\s*/, "")
    .replace(/\uFEFF/g, "")
    .trim();
}

function extensionOf(filename: string): string {
  const lower = filename.toLowerCase();
  const i = lower.lastIndexOf(".");
  return i >= 0 ? lower.slice(i) : "";
}

export function guessStudentImportMime(filename: string, reported: string): string {
  const ext = extensionOf(filename);
  const mime = (reported || "").toLowerCase().trim();
  if (ext === ".csv") return mime && mime !== "application/octet-stream" ? mime : "text/csv";
  if (ext === ".xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (ext === ".xls") return "application/vnd.ms-excel";
  return mime || "application/octet-stream";
}

export function validateStudentImportFileMeta(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (!file.name?.trim()) return "File name is required.";
  if (file.size <= 0) return "File is empty.";
  if (file.size > STUDENT_IMPORT_MAX_FILE_BYTES) {
    return `File exceeds the ${STUDENT_IMPORT_MAX_FILE_BYTES / (1024 * 1024)} MB limit.`;
  }

  const ext = extensionOf(file.name);
  if (ext === ".xls" && !STUDENT_IMPORT_ALLOW_XLS) {
    return "Legacy .xls is not supported. Save as .xlsx or .csv and upload again.";
  }
  if (ext !== ".xlsx" && ext !== ".csv" && !(ext === ".xls" && STUDENT_IMPORT_ALLOW_XLS)) {
    return "Unsupported file type. Upload .xlsx or .csv only.";
  }

  const mime = guessStudentImportMime(file.name, file.type);
  if (file.type && !ALLOWED_MIME.has(file.type.toLowerCase()) && file.type !== mime) {
    // Some browsers send empty or odd MIME; extension already checked — soft warn via MIME later.
    if (!ALLOWED_MIME.has(mime) && file.type && !ALLOWED_MIME.has(file.type.toLowerCase())) {
      return `Unsupported MIME type "${file.type}". Upload .xlsx or .csv.`;
    }
  }
  return null;
}

function extractVersionFromFilename(filename: string): string | null {
  const m = /_v(\d+\.\d+\.\d+)_/i.exec(filename) || /_v(\d+\.\d+\.\d+)\./i.exec(filename);
  return m?.[1] ?? null;
}

function extractVersionFromInstructions(aoa: unknown[][]): string | null {
  for (const row of aoa) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const key = String(row[0] ?? "")
      .trim()
      .toLowerCase();
    if (key === "template version") {
      const v = String(row[1] ?? "").trim();
      return v || null;
    }
  }
  return null;
}

function looksLikeHtml(buf: Buffer): boolean {
  const head = buf.subarray(0, 256).toString("utf8").toLowerCase();
  return head.includes("<!doctype html") || head.includes("<html");
}

function isZipXlsx(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

export function hashImportFile(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function parseStudentImportUpload(
  buffer: Buffer,
  filename: string,
  reportedMime: string,
): StudentImportUploadParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ext = extensionOf(filename) as ".xlsx" | ".xls" | ".csv" | "";
  const mime = guessStudentImportMime(filename, reportedMime);
  const fileHash = hashImportFile(buffer);

  const base: StudentImportUploadParseResult = {
    ok: false,
    errors,
    warnings,
    extension: ext === ".xlsx" || ext === ".xls" || ext === ".csv" ? ext : null,
    mime,
    fileHash,
    templateVersion: null,
    templateVersionOk: false,
    headers: [],
    dataRowCount: 0,
    sheetNames: [],
  };

  if (looksLikeHtml(buffer)) {
    errors.push("File content looks like HTML, not a spreadsheet. Re-export as .xlsx or .csv.");
    return base;
  }

  let headers: string[] = [];
  let dataRowCount = 0;
  let sheetNames: string[] = [];
  let templateVersion: string | null = extractVersionFromFilename(filename);

  try {
    if (ext === ".csv") {
      const text = buffer.toString("utf8");
      const rows = parseCsv(text);
      if (rows.length === 0) {
        errors.push("CSV has no rows.");
        return { ...base, templateVersion };
      }
      headers = (rows[0] ?? []).map(normalizeHeader).filter(Boolean);
      dataRowCount = Math.max(0, rows.length - 1);
      sheetNames = ["Students"];
    } else if (ext === ".xlsx" || (ext === ".xls" && STUDENT_IMPORT_ALLOW_XLS)) {
      if (ext === ".xlsx" && !isZipXlsx(buffer)) {
        errors.push("File extension is .xlsx but content is not a valid Office Open XML workbook.");
        return { ...base, templateVersion };
      }
      const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
      sheetNames = wb.SheetNames ?? [];
      if (sheetNames.length === 0) {
        errors.push("Workbook has no sheets.");
        return { ...base, templateVersion };
      }

      const studentsName =
        sheetNames.find((n) => n.trim().toLowerCase() === "students") ?? sheetNames[0];
      const studentsSheet = wb.Sheets[studentsName];
      if (!studentsSheet) {
        errors.push("Could not read the Students data sheet.");
        return { ...base, templateVersion, sheetNames };
      }
      const studentsAoa = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(studentsSheet, {
        header: 1,
        defval: "",
        raw: false,
      });
      if (!studentsAoa.length) {
        errors.push("Students sheet is empty.");
        return { ...base, templateVersion, sheetNames };
      }
      headers = (studentsAoa[0] ?? []).map(normalizeHeader).filter((h) => h.length > 0);
      dataRowCount = studentsAoa
        .slice(1)
        .filter((row) => Array.isArray(row) && row.some((c) => String(c ?? "").trim().length > 0)).length;

      const instructionsName = sheetNames.find((n) => n.trim().toLowerCase() === "instructions");
      if (instructionsName && wb.Sheets[instructionsName]) {
        const instrAoa = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
          wb.Sheets[instructionsName],
          { header: 1, defval: "", raw: false },
        );
        const fromInstr = extractVersionFromInstructions(instrAoa as unknown[][]);
        if (fromInstr) templateVersion = fromInstr;
      } else if (ext === ".xlsx") {
        warnings.push("Instructions sheet missing — template version could not be confirmed from the file.");
      }
    } else {
      errors.push("Unsupported file type.");
      return base;
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Could not parse the uploaded file.");
    return { ...base, templateVersion };
  }

  if (headers.length === 0) {
    errors.push("Could not detect column headings in the first row.");
  }

  if (dataRowCount > STUDENT_IMPORT_MAX_DATA_ROWS) {
    errors.push(
      `File has ${dataRowCount} data rows; maximum allowed is ${STUDENT_IMPORT_MAX_DATA_ROWS}. Split the file and retry.`,
    );
  }

  let templateVersionOk = false;
  if (!templateVersion) {
    warnings.push(
      `Template version not found. Current supported version is ${STUDENT_IMPORT_TEMPLATE_VERSION}. Prefer downloading a fresh template.`,
    );
  } else if (templateVersion !== STUDENT_IMPORT_TEMPLATE_VERSION) {
    errors.push(
      `Unsupported template version "${templateVersion}". Supported version is ${STUDENT_IMPORT_TEMPLATE_VERSION}. Download a new template.`,
    );
  } else {
    templateVersionOk = true;
  }

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    warnings,
    extension: ext === ".xlsx" || ext === ".xls" || ext === ".csv" ? ext : null,
    mime,
    fileHash,
    templateVersion,
    templateVersionOk,
    headers,
    dataRowCount,
    sheetNames,
  };
}

export function buildStudentImportStoragePath(batchId: string, uploaderId: string, filename: string): string {
  const safe = filename.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180);
  return `imports/${uploaderId}/${batchId}/${safe}`;
}
