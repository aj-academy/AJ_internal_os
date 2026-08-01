"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import {
  STUDENT_IMPORT_ALL_COLUMNS,
  STUDENT_IMPORT_MAX_FILE_BYTES,
  STUDENT_IMPORT_MAX_ROWS_RECOMMENDED,
  STUDENT_IMPORT_TEMPLATE_VERSION,
  type StudentImportColumn,
} from "@/lib/students/importTemplate";
import type { ColumnMapping } from "@/lib/students/importMapping";
import type { ImportMode } from "@/lib/students/importValidate";

type ImportBatchRow = {
  id: string;
  batch_number: string;
  file_name: string;
  data_row_count: number;
  status: string;
  uploaded_at: string;
  template_version: string | null;
  created_count?: number;
  updated_count?: number;
  skipped_count?: number;
  failed_count?: number;
  import_mode?: string | null;
};

type MappingResponse = {
  headers: string[];
  analysis: {
    autoMapping: ColumnMapping;
    ambiguous: { target: StudentImportColumn; candidates: string[] }[];
    missingRequired: StudentImportColumn[];
    unknownHeaders: string[];
  };
  previewRows: Record<string, string>[];
  totalRows: number;
  batch: ImportBatchRow & { column_mapping?: ColumnMapping; mapping_confirmed_at?: string | null };
};

const MODES: { id: ImportMode; label: string }[] = [
  { id: "skip_duplicates", label: "Create new + skip duplicates (safest default)" },
  { id: "create_only", label: "Create new only" },
  { id: "update_only", label: "Update existing only" },
  { id: "create_and_update", label: "Create new and update existing" },
  { id: "import_valid_skip_invalid", label: "Import valid rows; skip invalid" },
  { id: "stop_on_error", label: "Stop if any error exists" },
];

export function StudentBulkImportWorkbench() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"xlsx" | "csv" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [batches, setBatches] = useState<ImportBatchRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mappingInfo, setMappingInfo] = useState<MappingResponse | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [mode, setMode] = useState<ImportMode>("skip_duplicates");
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [drySummary, setDrySummary] = useState<Record<string, unknown> | null>(null);
  const [dryRows, setDryRows] = useState<unknown[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAllocateHint, setShowAllocateHint] = useState(false);

  const loadBatches = useCallback(async () => {
    const res = await fetch("/api/admin/students/import/upload", { credentials: "include" });
    const json = await res.json();
    if (res.ok) setBatches(json.batches ?? []);
  }, []);

  useEffect(() => {
    void loadBatches();
  }, [loadBatches]);

  const downloadTemplate = async (format: "xlsx" | "csv") => {
    setDownloading(format);
    setError(null);
    try {
      const res = await fetch(`/api/admin/students/import/template?format=${format}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || "Download failed");
        return;
      }
      const blob = await res.blob();
      const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = match?.[1] || `template.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      setSuccess("Template downloaded.");
    } finally {
      setDownloading(null);
    }
  };

  const openMapping = async (id: string) => {
    setBusy("mapping");
    setActiveId(id);
    setDrySummary(null);
    setShowAllocateHint(false);
    try {
      const res = await fetch(`/api/admin/students/import/${id}/mapping`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not load mapping");
        setHint(json.hint || null);
        return;
      }
      setMappingInfo(json);
      setMapping(json.batch.column_mapping?.["Registration Number"] ? json.batch.column_mapping : json.analysis.autoMapping);
    } finally {
      setBusy(null);
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/students/import/upload", {
        method: "POST",
        credentials: "include",
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        setError((json.errors || [json.error]).filter(Boolean).join(" ") || "Upload failed");
        setHint(json.hint || null);
        return;
      }
      setSuccess(`Uploaded ${json.batch.batch_number}`);
      await loadBatches();
      await openMapping(json.batch.id);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmMapping = async () => {
    if (!activeId) return;
    setBusy("confirm-map");
    setError(null);
    try {
      const res = await fetch(`/api/admin/students/import/${activeId}/mapping`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Mapping invalid");
        return;
      }
      setSuccess("Column mapping confirmed.");
      await loadBatches();
    } finally {
      setBusy(null);
    }
  };

  const runDryRun = async () => {
    if (!activeId) return;
    setBusy("dry-run");
    setError(null);
    try {
      const res = await fetch(`/api/admin/students/import/${activeId}/dry-run`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, confirmUpdateExisting: confirmUpdate }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Dry run failed");
        setHint(json.hint || null);
        return;
      }
      setDrySummary(json.summary);
      setDryRows(json.rows || []);
      if (json.priorSameFingerprint?.length) {
        setHint(
          `Same file fingerprint was imported before: ${json.priorSameFingerprint.map((p: { batch_number: string }) => p.batch_number).join(", ")}`,
        );
      }
      setSuccess("Dry run complete — no database student writes yet.");
      await loadBatches();
    } finally {
      setBusy(null);
    }
  };

  const executeImport = async () => {
    if (!activeId) return;
    if ((mode === "update_only" || mode === "create_and_update") && !confirmUpdate) {
      setError("Confirm updating existing students before executing.");
      return;
    }
    setBusy("execute");
    setError(null);
    try {
      const res = await fetch(`/api/admin/students/import/${activeId}/execute`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, confirmUpdateExisting: confirmUpdate }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Import failed");
        return;
      }
      setSuccess(
        `Import finished: created ${json.result.created}, updated ${json.result.updated}, skipped ${json.result.skipped}, failed ${json.result.failed}.`,
      );
      setShowAllocateHint(!!json.allocateMentorsNext);
      await loadBatches();
    } finally {
      setBusy(null);
    }
  };

  const cancelImport = async () => {
    if (!activeId) return;
    setBusy("cancel");
    try {
      const res = await fetch(`/api/admin/students/import/${activeId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) setError(json.error || "Cancel failed");
      else {
        setSuccess("Import cancelled.");
        setActiveId(null);
        setMappingInfo(null);
        setDrySummary(null);
      }
      await loadBatches();
    } finally {
      setBusy(null);
    }
  };

  const downloadErrors = (only: string, format: string) => {
    if (!activeId) return;
    window.open(`/api/admin/students/import/${activeId}/errors?only=${only}&format=${format}`, "_blank");
  };

  const headerOptions = useMemo(() => mappingInfo?.headers ?? [], [mappingInfo]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Student Management"
        title="Bulk Import Students"
        description="Template → upload → map columns → dry run → confirm import. Portal Auth students only (not CRM leads)."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!!downloading} onClick={() => void downloadTemplate("xlsx")}>
              {downloading === "xlsx" ? "…" : "Excel template"}
            </Button>
            <Button type="button" variant="secondary" disabled={!!downloading} onClick={() => void downloadTemplate("csv")}>
              CSV template
            </Button>
          </div>
        }
      />

      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">{hint}</div> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Upload</h2>
        <p className="text-xs text-muted-foreground">
          v{STUDENT_IMPORT_TEMPLATE_VERSION} · max {STUDENT_IMPORT_MAX_ROWS_RECOMMENDED} rows ·{" "}
          {STUDENT_IMPORT_MAX_FILE_BYTES / (1024 * 1024)} MB · .xlsx/.csv
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && void uploadFile(e.target.files[0])}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void uploadFile(f);
          }}
          className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 ${
            dragOver ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <p className="text-sm">{uploading ? "Uploading…" : "Drag & drop or browse filled template"}</p>
          <Button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            Browse
          </Button>
        </div>
      </section>

      {mappingInfo && activeId ? (
        <section className="rounded-lg border border-border bg-card p-4 space-y-4">
          <h2 className="text-sm font-semibold">Column mapping · {mappingInfo.totalRows} rows</h2>
          {mappingInfo.analysis.ambiguous.length > 0 ? (
            <p className="text-sm text-amber-800">
              Ambiguous headers need confirmation:{" "}
              {mappingInfo.analysis.ambiguous.map((a) => a.target).join(", ")}
            </p>
          ) : null}
          {mappingInfo.analysis.unknownHeaders.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Unknown columns (ignored): {mappingInfo.analysis.unknownHeaders.join(", ")}
            </p>
          ) : null}
          <div className="grid gap-2 md:grid-cols-2">
            {STUDENT_IMPORT_ALL_COLUMNS.map((col) => (
              <label key={col} className="flex flex-col gap-1 text-xs">
                <span className="font-medium">{col}</span>
                <select
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  value={mapping[col] || ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value || null }))}
                >
                  <option value="">— not mapped —</option>
                  {headerOptions.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="overflow-x-auto">
            <p className="mb-1 text-xs text-muted-foreground">Preview (first 10)</p>
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead>
                <tr className="border-b">
                  {headerOptions.slice(0, 8).map((h) => (
                    <th key={h} className="py-1 pr-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mappingInfo.previewRows.map((r, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {headerOptions.slice(0, 8).map((h) => (
                      <td key={h} className="py-1 pr-2">
                        {r[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" disabled={!!busy} onClick={() => void confirmMapping()}>
            Confirm mapping
          </Button>
        </section>
      ) : null}

      {activeId ? (
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Import mode & dry run</h2>
          <div className="grid gap-2">
            {MODES.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={mode === m.id} onChange={() => setMode(m.id)} />
                {m.label}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirmUpdate} onChange={(e) => setConfirmUpdate(e.target.checked)} />
            I confirm updates to existing students (does not overwrite passwords / auth IDs / mentors / grades)
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!!busy} onClick={() => void runDryRun()}>
              {busy === "dry-run" ? "Validating…" : "Dry run"}
            </Button>
            <Button type="button" disabled={!!busy || !drySummary} onClick={() => void executeImport()}>
              {busy === "execute" ? "Importing…" : "Confirm import"}
            </Button>
            <Button type="button" variant="outline" disabled={!!busy} onClick={() => void cancelImport()}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" disabled={!activeId} onClick={() => downloadErrors("errors", "csv")}>
              Error CSV
            </Button>
            <Button type="button" variant="secondary" disabled={!activeId} onClick={() => downloadErrors("failed", "xlsx")}>
              Failed XLSX
            </Button>
          </div>
          {drySummary ? (
            <div className="grid gap-2 text-sm sm:grid-cols-4">
              {["total", "valid", "warning", "error", "create", "update", "skip", "blocked"].map((k) => (
                <div key={k} className="rounded-md bg-muted/40 px-3 py-2">
                  {k}: <strong>{String((drySummary as Record<string, number>)[k] ?? 0)}</strong>
                </div>
              ))}
            </div>
          ) : null}
          {dryRows.length > 0 ? (
            <p className="text-xs text-muted-foreground">Showing validation sample ({dryRows.length} of dry-run rows).</p>
          ) : null}
        </section>
      ) : null}

      {showAllocateHint ? (
        <section className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
          <h2 className="text-sm font-semibold">Next step: Allocate mentors</h2>
          <p className="text-sm text-muted-foreground">
            Student import finished. Mentor allocation is a separate auditable action.
          </p>
          <a className="text-sm font-medium underline" href="/admin/students/mentor-allocation">
            Open Mentor Allocation
          </a>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Import history</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadBatches()}>
            Refresh
          </Button>
        </div>
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No batches yet. Run student_import_batches.sql + student_import_rows.sql.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-2">Batch</th>
                  <th className="py-2 pr-2">File</th>
                  <th className="py-2 pr-2">Rows</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">C/U/S/F</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-border/60">
                    <td className="py-2 pr-2 font-medium">{b.batch_number}</td>
                    <td className="py-2 pr-2 truncate max-w-[180px]">{b.file_name}</td>
                    <td className="py-2 pr-2">{b.data_row_count}</td>
                    <td className="py-2 pr-2">{b.status}</td>
                    <td className="py-2 pr-2 text-xs">
                      {b.created_count ?? 0}/{b.updated_count ?? 0}/{b.skipped_count ?? 0}/{b.failed_count ?? 0}
                    </td>
                    <td className="py-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void openMapping(b.id)}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
