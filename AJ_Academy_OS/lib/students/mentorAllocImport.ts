/**
 * Mentor allocation spreadsheet template + parse/validate (Phase 19).
 */

import * as XLSX from "xlsx";
import { buildCsv, parseCsv } from "@/lib/csv";
import { MENTOR_ROLES, type MentorRole } from "@/lib/students/mentorAssignments";

export const MENTOR_ALLOC_TEMPLATE_VERSION = "1.0.0";
export const MENTOR_ALLOC_MAX_ROWS = 500;
export const MENTOR_ALLOC_MAX_BYTES = 5 * 1024 * 1024;

export const MENTOR_ALLOC_COLUMNS = [
  "Student Registration Number",
  "Student Email",
  "Mentor Email",
  "Mentor Role",
  "Primary/Secondary",
  "Start Date",
  "End Date",
  "Department",
  "Course",
  "Batch",
  "Notes",
] as const;

export type MentorAllocColumn = (typeof MENTOR_ALLOC_COLUMNS)[number];

export type MentorAllocParsedRow = {
  rowNumber: number;
  raw: Record<string, string>;
  studentReg: string;
  studentEmail: string;
  mentorEmail: string;
  mentorRole: MentorRole;
  isPrimary: boolean;
  startDate: string;
  endDate: string | null;
  department: string;
  course: string;
  batch: string;
  notes: string;
  severity: "valid" | "warning" | "error";
  issues: string[];
};

function normHeader(h: string): string {
  return h.replace(/^\*\s*/, "").replace(/\uFEFF/g, "").trim().toLowerCase();
}

function parseDate(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function buildMentorAllocTemplateBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const headers = MENTOR_ALLOC_COLUMNS.map((c) =>
    ["Student Registration Number", "Student Email", "Mentor Email", "Mentor Role", "Primary/Secondary", "Start Date"].includes(
      c,
    )
      ? `* ${c}`
      : c,
  );
  const example = [
    "AJ-2026-0001",
    "ada.lovelace.example@ajacademy.local",
    "mentor@ajacademy.local",
    "primary_academic",
    "Primary",
    new Date().toISOString().slice(0, 10),
    "",
    "Engineering",
    "Full Stack",
    "2026-A",
    "EXAMPLE — delete before import",
  ];
  const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
  XLSX.utils.book_append_sheet(wb, sheet, "Allocations");

  const instructions = [
    ["AJ Academy — Mentor Allocation Import"],
    ["Template Version", MENTOR_ALLOC_TEMPLATE_VERSION],
    ["Generated At (UTC)", new Date().toISOString()],
    [],
    ["Required: Student Registration Number OR Student Email (at least one), Mentor Email, Mentor Role, Primary/Secondary, Start Date"],
    ["Mentor Role values", MENTOR_ROLES.join(", ")],
    ["Primary/Secondary", "Primary | Secondary"],
    ["Dates", "YYYY-MM-DD"],
    ["Max rows", String(MENTOR_ALLOC_MAX_ROWS)],
    ["Do not put passwords in this file."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), "Instructions");

  const roles = [["Mentor Role"], ...MENTOR_ROLES.map((r) => [r])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(roles), "Valid Values");

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

export function buildMentorAllocCsv(): string {
  const headers = MENTOR_ALLOC_COLUMNS.map((c) =>
    ["Student Registration Number", "Student Email", "Mentor Email", "Mentor Role", "Primary/Secondary", "Start Date"].includes(
      c,
    )
      ? `* ${c}`
      : c,
  );
  return buildCsv(headers, [
    [
      "AJ-2026-0001",
      "ada.lovelace.example@ajacademy.local",
      "mentor@ajacademy.local",
      "primary_academic",
      "Primary",
      new Date().toISOString().slice(0, 10),
      "",
      "",
      "",
      "",
      "",
    ],
  ]);
}

function loadGrid(buffer: Buffer, filename: string): string[][] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return parseCsv(buffer.toString("utf8"));
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const name =
    wb.SheetNames.find((n) => n.toLowerCase() === "allocations") ?? wb.SheetNames[0];
  const aoa = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(wb.Sheets[name], {
    header: 1,
    defval: "",
    raw: false,
  });
  return aoa.map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? "").trim()) : []));
}

export function parseMentorAllocFile(buffer: Buffer, filename: string): {
  ok: boolean;
  errors: string[];
  rows: MentorAllocParsedRow[];
  templateVersion: string | null;
} {
  const errors: string[] = [];
  if (buffer.length > MENTOR_ALLOC_MAX_BYTES) {
    return { ok: false, errors: ["File exceeds 5 MB limit."], rows: [], templateVersion: null };
  }
  const lower = filename.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".csv")) {
    return { ok: false, errors: ["Upload .xlsx or .csv only."], rows: [], templateVersion: null };
  }

  let templateVersion: string | null = null;
  const vm = /_v(\d+\.\d+\.\d+)/i.exec(filename);
  if (vm) templateVersion = vm[1];

  const grid = loadGrid(buffer, filename);
  if (!grid.length) return { ok: false, errors: ["File is empty."], rows: [], templateVersion };

  // Try instructions version from xlsx
  if (lower.endsWith(".xlsx")) {
    try {
      const wb = XLSX.read(buffer, { type: "buffer" });
      const instr = wb.SheetNames.find((n) => n.toLowerCase() === "instructions");
      if (instr) {
        const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[instr], {
          header: 1,
          defval: "",
        });
        for (const row of aoa) {
          if (String(row[0] ?? "").toLowerCase() === "template version") {
            templateVersion = String(row[1] ?? "").trim() || templateVersion;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (templateVersion && templateVersion !== MENTOR_ALLOC_TEMPLATE_VERSION) {
    errors.push(
      `Unsupported template version "${templateVersion}". Expected ${MENTOR_ALLOC_TEMPLATE_VERSION}.`,
    );
  }

  const headers = (grid[0] ?? []).map((h) => h.replace(/^\*\s*/, "").trim());
  const headerIndex = new Map(headers.map((h, i) => [normHeader(h), i]));

  const get = (line: string[], col: MentorAllocColumn): string => {
    const i = headerIndex.get(normHeader(col));
    if (i === undefined) return "";
    return String(line[i] ?? "").trim();
  };

  for (const col of [
    "Mentor Email",
    "Mentor Role",
    "Primary/Secondary",
    "Start Date",
  ] as MentorAllocColumn[]) {
    if (!headerIndex.has(normHeader(col))) errors.push(`Missing column: ${col}`);
  }
  if (!headerIndex.has(normHeader("Student Registration Number")) && !headerIndex.has(normHeader("Student Email"))) {
    errors.push("Need Student Registration Number or Student Email column.");
  }

  if (errors.length) return { ok: false, errors, rows: [], templateVersion };

  const rows: MentorAllocParsedRow[] = [];
  for (let i = 1; i < grid.length; i += 1) {
    const line = grid[i];
    if (!line.some((c) => String(c ?? "").trim())) continue;
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = String(line[idx] ?? "").trim();
    });

    const issues: string[] = [];
    const studentReg = get(line, "Student Registration Number");
    const studentEmail = get(line, "Student Email").toLowerCase();
    const mentorEmail = get(line, "Mentor Email").toLowerCase();
    const roleRaw = get(line, "Mentor Role").toLowerCase().replace(/\s+/g, "_");
    const ps = get(line, "Primary/Secondary").toLowerCase();
    const startRaw = get(line, "Start Date");
    const endRaw = get(line, "End Date");

    if (!studentReg && !studentEmail) issues.push("Student Registration Number or Email required.");
    if (!mentorEmail) issues.push("Mentor Email required.");
    if (!(MENTOR_ROLES as readonly string[]).includes(roleRaw)) {
      issues.push(`Invalid Mentor Role. Use: ${MENTOR_ROLES.join(", ")}`);
    }
    if (ps !== "primary" && ps !== "secondary") {
      issues.push('Primary/Secondary must be "Primary" or "Secondary".');
    }
    const startDate = parseDate(startRaw);
    if (!startDate) issues.push("Invalid Start Date (YYYY-MM-DD).");
    const endDate = endRaw ? parseDate(endRaw) : null;
    if (endRaw && !endDate) issues.push("Invalid End Date (YYYY-MM-DD).");
    if (startDate && endDate && endDate < startDate) issues.push("End Date before Start Date.");

    rows.push({
      rowNumber: i + 1,
      raw,
      studentReg,
      studentEmail,
      mentorEmail,
      mentorRole: ((MENTOR_ROLES as readonly string[]).includes(roleRaw)
        ? roleRaw
        : "academic") as MentorRole,
      isPrimary: ps === "primary" || roleRaw === "primary_academic",
      startDate: startDate || "",
      endDate,
      department: get(line, "Department"),
      course: get(line, "Course"),
      batch: get(line, "Batch"),
      notes: get(line, "Notes"),
      severity: issues.length ? "error" : "valid",
      issues,
    });
  }

  if (rows.length > MENTOR_ALLOC_MAX_ROWS) {
    errors.push(`Too many rows (${rows.length}); max ${MENTOR_ALLOC_MAX_ROWS}.`);
  }

  return { ok: errors.length === 0, errors, rows, templateVersion };
}
