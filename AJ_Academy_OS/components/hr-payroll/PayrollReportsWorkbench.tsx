"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReportKind =
  | "payroll_register"
  | "employee_salary"
  | "attendance_payroll"
  | "leave_deduction"
  | "lop"
  | "incentive"
  | "bonus"
  | "deduction"
  | "reimbursement"
  | "department"
  | "bank_transfer"
  | "payment_status"
  | "payslip_generation"
  | "audit";

const REPORT_OPTIONS: { value: ReportKind; label: string }[] = [
  { value: "payroll_register", label: "Payroll register" },
  { value: "employee_salary", label: "Employee salary" },
  { value: "attendance_payroll", label: "Attendance vs payroll" },
  { value: "leave_deduction", label: "Leave deduction" },
  { value: "lop", label: "Loss of pay" },
  { value: "incentive", label: "Incentives" },
  { value: "bonus", label: "Bonus" },
  { value: "deduction", label: "Deductions" },
  { value: "reimbursement", label: "Reimbursements" },
  { value: "department", label: "Department summary" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "payment_status", label: "Payment status" },
  { value: "payslip_generation", label: "Payslip generation" },
  { value: "audit", label: "Audit trail" },
];

const MONTH_NAMES = ["","January","February","March","April","May","June",
  "July","August","September","October","November","December"];

const inputClass = "h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]";

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [keys.join(","), ...rows.map((r) => keys.map((k) => escape(r[k])).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadXlsx(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Report");
  XLSX.writeFile(book, filename);
}

async function downloadPdf(filename: string, title: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(12);
  doc.text(title, 40, 36);
  const keys = Object.keys(rows[0]).slice(0, 10);
  autoTable(doc, {
    startY: 48,
    head: [keys],
    body: rows.map((r) => keys.map((k) => (r[k] == null ? "" : String(r[k])))),
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [61, 52, 40] },
  });
  doc.save(filename);
}

export function PayrollReportsWorkbench() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [kind, setKind] = useState<ReportKind>("payroll_register");
  const [department, setDepartment] = useState("");
  const [maskBank, setMaskBank] = useState(true);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const params = new URLSearchParams({
        kind,
        year: String(year),
        month: String(month),
        maskBank: maskBank ? "1" : "0",
      });
      if (department.trim()) params.set("department", department.trim());
      const res = await fetch(`/api/hr/payroll/reports?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load report");
      setRows(json.rows ?? []);
      setWarning(json.warning ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [kind, year, month, department, maskBank]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);
  const baseName = `${kind}_${year}_${String(month).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="HR, Attendance & Payroll"
        title="Payroll Reports"
        description="Register, bank transfer, attendance, and audit exports. Bank account numbers stay masked unless you explicitly unmask (admin-only)."
      />

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {warning ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {warning}
        </div>
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Report
            <select
              className={`${inputClass} min-w-[200px]`}
              value={kind}
              onChange={(e) => setKind(e.target.value as ReportKind)}
            >
              {REPORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Year
            <input
              type="number"
              className={`${inputClass} w-24`}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Month
            <select className={inputClass} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.slice(1).map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Department
            <input
              className={`${inputClass} w-40`}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="All"
            />
          </label>
          {kind === "bank_transfer" ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
              <input type="checkbox" checked={maskBank} onChange={(e) => setMaskBank(e.target.checked)} />
              Mask account numbers
            </label>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
          <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => downloadCsv(`${baseName}.csv`, rows)}>
            CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!rows.length}
            onClick={() => void downloadXlsx(`${baseName}.xlsx`, rows)}
          >
            Excel
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!rows.length}
            onClick={() => void downloadPdf(`${baseName}.pdf`, `${kind} ${year}-${month}`, rows)}
          >
            PDF
          </Button>
          <p className="text-xs text-muted-foreground">{MONTH_NAMES[month]} {year} · {rows.length} row(s)</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#e8dcc8] text-xs text-muted-foreground">
                {columns.map((c) => (
                  <th key={c} className="py-2 pr-3 font-medium whitespace-nowrap">
                    {c.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} className="border-b border-[#f0e6d6]">
                  {columns.map((c) => (
                    <td key={c} className="py-2 pr-3 whitespace-nowrap">
                      {r[c] == null ? "—" : String(r[c])}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length && !loading ? (
                <tr>
                  <td colSpan={Math.max(columns.length, 1)} className="py-6 text-center text-sm text-muted-foreground">
                    No rows for this report.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
