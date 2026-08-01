/**
 * Load raw spreadsheet rows from an uploaded import file buffer.
 */

import * as XLSX from "xlsx";
import { parseCsv } from "@/lib/csv";

function normalizeHeader(cell: unknown): string {
  return String(cell ?? "")
    .replace(/^\*\s*/, "")
    .replace(/\uFEFF/g, "")
    .trim();
}

export function loadStudentImportDataRows(
  buffer: Buffer,
  filename: string,
): { headers: string[]; rows: Record<string, string>[] } {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const grid = parseCsv(buffer.toString("utf8"));
    if (!grid.length) return { headers: [], rows: [] };
    const headers = (grid[0] ?? []).map(normalizeHeader);
    const rows: Record<string, string>[] = [];
    for (const line of grid.slice(1)) {
      if (!line.some((c) => String(c ?? "").trim())) continue;
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = String(line[i] ?? "").trim();
      });
      rows.push(obj);
    }
    return { headers, rows };
  }

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const studentsName =
    wb.SheetNames.find((n) => n.trim().toLowerCase() === "students") ?? wb.SheetNames[0];
  const sheet = wb.Sheets[studentsName];
  if (!sheet) return { headers: [], rows: [] };
  const aoa = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (!aoa.length) return { headers: [], rows: [] };
  const headers = (aoa[0] ?? []).map(normalizeHeader);
  const rows: Record<string, string>[] = [];
  for (const line of aoa.slice(1)) {
    if (!Array.isArray(line) || !line.some((c) => String(c ?? "").trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      const cell = line[i];
      if (typeof cell === "object" && cell !== null && Object.prototype.toString.call(cell) === "[object Date]") {
        obj[h] = (cell as Date).toISOString().slice(0, 10);
      } else obj[h] = String(cell ?? "").trim();
    });
    rows.push(obj);
  }
  return { headers, rows };
}
