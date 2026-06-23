import { buildCsv, downloadCsv } from "@/lib/csv";

export type ExportRow = Record<string, string | number | boolean | null | undefined>;

function safeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function prettifyHeader(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function exportRowsAsCsv(filename: string, rows: ExportRow[]) {
  if (!rows.length) return;
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
  const tableRows = rows.map((row) => headers.map((header) => row[header] ?? ""));
  const csvHeaders = headers.map(prettifyHeader);
  downloadCsv(filename, buildCsv(csvHeaders, tableRows));
}

export async function exportRowsAsExcel(filename: string, rows: ExportRow[]) {
  if (!rows.length) return;
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Report");
  XLSX.writeFile(wb, filename);
}

export async function exportRowsAsPdf(title: string, filename: string, rows: ExportRow[]) {
  if (!rows.length) return;
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
  const pdf = new jsPDF({ orientation: "landscape" });
  pdf.setFontSize(14);
  pdf.text(title, 14, 16);
  autoTable(pdf, {
    head: [headers.map(prettifyHeader)],
    body: rows.map((row) => headers.map((header) => safeText(row[header]))),
    startY: 22,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [201, 162, 39] },
  });
  pdf.save(filename);
}
