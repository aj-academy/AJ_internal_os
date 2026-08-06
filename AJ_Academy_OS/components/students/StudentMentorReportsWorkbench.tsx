"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import { downloadUrlInSameWindow } from "@/lib/browser/sameWindowDownload";

const REPORTS = [
  { kind: "import_summary", label: "Student import summary" },
  { kind: "students_without_mentor", label: "Students without primary mentor" },
  { kind: "students_with_multiple_mentors", label: "Students with multiple mentors" },
  { kind: "mentor_workload", label: "Mentor capacity / workload" },
  { kind: "expiring_allocations", label: "Expiring allocations (14 days)" },
  { kind: "temporary_allocations", label: "Temporary allocations" },
  { kind: "allocation_history", label: "Allocation history" },
] as const;

export function StudentMentorReportsWorkbench() {
  const [kind, setKind] = useState<(typeof REPORTS)[number]["kind"]>("import_summary");
  const [preview, setPreview] = useState<{ title: string; headers: string[]; rows: unknown[][]; count: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadJson = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/students/reports?kind=${kind}&format=json`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Report failed");
      setPreview(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const download = (format: "csv" | "xlsx" | "pdf") => {
    void downloadUrlInSameWindow(
      `/api/admin/students/reports?kind=${kind}&format=${format}`,
      `report-${kind}.${format}`,
    ).catch((e) => setError(e instanceof Error ? e.message : "Download failed"));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Student Management"
        title="Import & Allocation Reports"
        description="Export student import and mentor allocation reports as CSV, Excel, or PDF."
      />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <label className="block text-sm space-y-1">
          <span className="font-medium">Report</span>
          <select
            className="w-full max-w-md rounded-md border px-2 py-2 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {REPORTS.map((r) => (
              <option key={r.kind} value={r.kind}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={loading} onClick={() => void loadJson()}>
            {loading ? "Loading…" : "Preview"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => download("csv")}>
            CSV
          </Button>
          <Button type="button" variant="secondary" onClick={() => download("xlsx")}>
            Excel
          </Button>
          <Button type="button" variant="secondary" onClick={() => download("pdf")}>
            PDF
          </Button>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </section>

      {preview ? (
        <section className="rounded-lg border border-border bg-card p-4 space-y-2 print:border-0">
          <h2 className="text-sm font-semibold">
            {preview.title} ({preview.count})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b">
                  {preview.headers.map((h) => (
                    <th key={h} className="py-2 pr-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((row, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {row.map((cell, j) => (
                      <td key={j} className="py-1 pr-2">
                        {cell == null ? "" : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.count > 100 ? (
            <p className="text-xs text-muted-foreground">Preview shows first 100 rows; exports include full result.</p>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Choose a report and click Preview or export directly.</p>
      )}
    </div>
  );
}
