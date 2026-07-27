import { buildCsv, downloadCsv } from "@/lib/csv";

export type ExportRow = Record<string, string | number | boolean | null | undefined>;

function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function prettifyHeader(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const TECHNICAL_EXPORT_KEYS = new Set([
  "id",
  "employeeid",
  "employee_id",
  "startedat",
  "started_at",
  "endedat",
  "ended_at",
  "leadid",
  "lead_id",
  "clientid",
  "client_id",
  "collegevisitid",
  "college_visit_id",
  "userid",
  "user_id",
  "createdby",
  "created_by",
  "updatedat",
  "updated_at",
  "createdat",
  "created_at",
]);

function isTechnicalKey(key: string): boolean {
  const k = key.trim().toLowerCase().replace(/\s+/g, "");
  if (TECHNICAL_EXPORT_KEYS.has(k)) return true;
  if (k === "id" || k.endsWith("id") && (k.includes("employee") || k.includes("lead") || k.includes("client"))) {
    return true;
  }
  // UUID-looking lone id keys
  if (k === "uuid") return true;
  return false;
}

function looksLikeRawCallActivityRow(row: ExportRow): boolean {
  const keys = Object.keys(row).map((k) => k.toLowerCase());
  return (
    keys.includes("employeeid") ||
    keys.includes("startedat") ||
    keys.includes("durationsec") ||
    (keys.includes("leadname") && keys.includes("employee") && keys.includes("outcome"))
  );
}

/** Keep only human-facing Call Activity fields for CSV/Excel/PDF. */
export function formatCallActivityExportRows(rows: ExportRow[]): ExportRow[] {
  return rows.map((r) => {
    const whenDate = safeText(r.date ?? r.Date);
    const whenTime = safeText(r.time ?? r.Time);
    const whenCombined = safeText(r.When);
    return {
      Employee: safeText(r.employee ?? r.Employee),
      Source: safeText(r.source ?? r.Source),
      "Lead / College": safeText(r.leadName ?? r["Lead / College"] ?? r["Lead Name"]),
      Mobile: safeText(r.mobile ?? r.Mobile),
      When: whenCombined || [whenDate, whenTime].filter((x) => x && x !== "-").join(" ") || "-",
      Outcome: safeText(r.outcome ?? r.Outcome),
      Remarks: safeText(r.remarks ?? r.Remarks),
      "Next Follow-up": safeText(r.nextFollowUp ?? r["Next Follow-up"] ?? r.NextFollowUp),
      Status: safeText(r.status ?? r.Status),
    };
  });
}

function sanitizeRowsForPdf(rows: ExportRow[]): ExportRow[] {
  if (!rows.length) return rows;
  if (looksLikeRawCallActivityRow(rows[0]!)) {
    return formatCallActivityExportRows(rows);
  }
  return rows.map((row) => {
    const next: ExportRow = {};
    for (const [key, value] of Object.entries(row)) {
      if (isTechnicalKey(key)) continue;
      next[key] = value;
    }
    return next;
  });
}

function collectHeaders(rows: ExportRow[]): string[] {
  const first = rows[0];
  if (first) return Object.keys(first);
  const set = new Set<string>();
  rows.forEach((row) => Object.keys(row).forEach((k) => set.add(k)));
  return Array.from(set);
}

function buildColumnWidths(headers: string[], usableWidth: number): Record<number, { cellWidth: number }> {
  const weights = headers.map((header) => {
    const key = header.toLowerCase();
    if (key.includes("remark")) return 2.6;
    if (key.includes("lead") || key.includes("college")) return 2.2;
    if (key.includes("employee") || key.includes("when")) return 1.5;
    if (key.includes("follow") || key.includes("status") || key.includes("outcome") || key.includes("source")) return 1.2;
    if (key.includes("mobile")) return 1.1;
    return 1;
  });
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  // Exact proportional widths that sum to usableWidth (no Math.max inflation).
  const raw = weights.map((w) => (usableWidth * w) / weightSum);
  const floors = raw.map((w) => Math.floor(w));
  let remainder = usableWidth - floors.reduce((a, b) => a + b, 0);
  for (let i = 0; remainder > 0; i += 1, remainder -= 1) {
    floors[i % floors.length] += 1;
  }
  return Object.fromEntries(floors.map((w, idx) => [idx, { cellWidth: w }]));
}

export function exportRowsAsCsv(filename: string, rows: ExportRow[]) {
  if (!rows.length) return;
  const prepared = looksLikeRawCallActivityRow(rows[0]!) ? formatCallActivityExportRows(rows) : rows;
  const headers = collectHeaders(prepared);
  const tableRows = prepared.map((row) => headers.map((header) => row[header] ?? ""));
  const csvHeaders = headers.map(prettifyHeader);
  downloadCsv(filename, buildCsv(csvHeaders, tableRows));
}

export async function exportRowsAsExcel(filename: string, rows: ExportRow[]) {
  if (!rows.length) return;
  const prepared = looksLikeRawCallActivityRow(rows[0]!) ? formatCallActivityExportRows(rows) : rows;
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(prepared);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Report");
  XLSX.writeFile(wb, filename);
}

export async function exportMultiSheetExcel(
  filename: string,
  sheets: { name: string; rows: ExportRow[] }[],
) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  let added = 0;
  for (const { name, rows } of sheets) {
    if (!rows.length) continue;
    const prepared = looksLikeRawCallActivityRow(rows[0]!) ? formatCallActivityExportRows(rows) : rows;
    const safeName = name.replace(/[\\/?*[\]]/g, "").slice(0, 31);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prepared), safeName || `Sheet${added + 1}`);
    added += 1;
  }
  if (!added) return;
  XLSX.writeFile(wb, filename);
}

export type PdfExportOptions = {
  generatedBy?: string | null;
  generatedAt?: string;
  dateRange?: string;
  summary?: string;
  logoDataUrl?: string | null;
};

export async function exportRowsAsPdf(
  title: string,
  filename: string,
  rows: ExportRow[],
  options?: PdfExportOptions,
) {
  if (!rows.length) return;
  const prepared = sanitizeRowsForPdf(rows);
  if (!prepared.length) return;

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const headers = collectHeaders(prepared);

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 24;
  let y = 28;

  if (options?.logoDataUrl) {
    try {
      pdf.addImage(options.logoDataUrl, "PNG", marginX, 16, 28, 28);
      y = 48;
    } catch {
      /* ignore invalid logo */
    }
  }

  pdf.setFontSize(14);
  pdf.setTextColor(15, 23, 42);
  pdf.text(title, options?.logoDataUrl ? marginX + 36 : marginX, y);
  y += 14;
  pdf.setFontSize(9);
  pdf.setTextColor(100);
  const metaLines = [
    options?.generatedAt ? `Generated: ${options.generatedAt}` : null,
    options?.generatedBy ? `Generated by: ${options.generatedBy}` : null,
    options?.dateRange ? `Range: ${options.dateRange}` : null,
    options?.summary ? `Summary: ${options.summary}` : null,
  ].filter(Boolean) as string[];
  metaLines.forEach((line) => {
    pdf.text(line, marginX, y);
    y += 12;
  });

  const usableWidth = pageWidth - marginX * 2;
  const columnStyles = buildColumnWidths(headers, usableWidth);

  autoTable(pdf, {
    head: [headers.map(prettifyHeader)],
    body: prepared.map((row) => headers.map((header) => safeText(row[header]) || "-")),
    startY: Math.max(44, y + 8),
    margin: { left: marginX, right: marginX, top: 24, bottom: 28 },
    tableWidth: usableWidth,
    styles: {
      fontSize: 8,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
      overflow: "linebreak",
      valign: "top",
      halign: "left",
      lineColor: [226, 232, 240],
      lineWidth: 0.4,
      textColor: [51, 65, 85],
    },
    headStyles: {
      fillColor: [201, 162, 39],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
      overflow: "linebreak",
      valign: "middle",
      halign: "left",
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
    },
    alternateRowStyles: {
      fillColor: [250, 252, 255],
    },
    columnStyles,
    didDrawPage: (data) => {
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text(`Page ${data.pageNumber}`, pageWidth - marginX, pageHeight - 14, { align: "right" });
    },
  });

  pdf.save(filename);
}
