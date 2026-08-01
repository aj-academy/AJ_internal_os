"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import {
  STUDENT_IMPORT_MAX_FILE_BYTES,
  STUDENT_IMPORT_MAX_ROWS_RECOMMENDED,
  STUDENT_IMPORT_OPTIONAL_COLUMNS,
  STUDENT_IMPORT_REQUIRED_COLUMNS,
  STUDENT_IMPORT_TEMPLATE_VERSION,
} from "@/lib/students/importTemplate";

type CatalogSummary = {
  departmentCount: number;
  courseCount: number;
  batchCount: number;
};

type ImportBatchRow = {
  id: string;
  batch_number: string;
  file_name: string;
  file_mime: string | null;
  file_size_bytes: number | null;
  template_version: string | null;
  template_version_ok: boolean;
  data_row_count: number;
  status: string;
  uploaded_at: string;
  error_message: string | null;
};

type UploadResultBatch = ImportBatchRow & {
  storage_path?: string | null;
  detected_headers?: string[];
  file_hash?: string;
};

export function StudentBulkImportWorkbench() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [downloading, setDownloading] = useState<"xlsx" | "csv" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [summary, setSummary] = useState<CatalogSummary | null>(null);
  const [batches, setBatches] = useState<ImportBatchRow[]>([]);
  const [lastUpload, setLastUpload] = useState<UploadResultBatch | null>(null);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);

  const loadCatalogSummary = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const res = await fetch("/api/lms/academic", { credentials: "include" });
      const json = (await res.json()) as {
        error?: string;
        hint?: string;
        departments?: unknown[];
        courses?: unknown[];
        batches?: unknown[];
      };
      if (!res.ok) {
        setError(json.error || "Could not load academic catalog.");
        setHint(json.hint || null);
        setSummary(null);
        return;
      }
      setSummary({
        departmentCount: json.departments?.length ?? 0,
        courseCount: json.courses?.length ?? 0,
        batchCount: json.batches?.length ?? 0,
      });
    } catch {
      setError("Network error while loading academic catalog.");
      setSummary(null);
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const res = await fetch("/api/admin/students/import/upload", { credentials: "include" });
      const json = (await res.json()) as {
        error?: string;
        hint?: string;
        batches?: ImportBatchRow[];
      };
      if (!res.ok) {
        setHint(json.hint || json.error || null);
        setBatches([]);
        return;
      }
      setBatches(json.batches ?? []);
    } catch {
      setBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalogSummary();
    void loadBatches();
  }, [loadCatalogSummary, loadBatches]);

  const downloadTemplate = async (format: "xlsx" | "csv") => {
    setDownloading(format);
    setError(null);
    setHint(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/students/import/template?format=${format}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string; hint?: string };
        setError(json.error || "Template download failed.");
        setHint(json.hint || null);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename =
        match?.[1] ||
        (format === "xlsx"
          ? `AJ_Student_Import_Template_v${STUDENT_IMPORT_TEMPLATE_VERSION}.xlsx`
          : `AJ_Student_Import_Template_v${STUDENT_IMPORT_TEMPLATE_VERSION}.csv`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess(`${format.toUpperCase()} template downloaded (${filename}).`);
    } catch {
      setError("Network error while downloading template.");
    } finally {
      setDownloading(null);
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setHint(null);
    setSuccess(null);
    setUploadWarnings([]);
    setLastUpload(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/students/import/upload", {
        method: "POST",
        credentials: "include",
        body,
      });
      const json = (await res.json()) as {
        error?: string;
        hint?: string;
        errors?: string[];
        warnings?: string[];
        batch?: UploadResultBatch;
        priorSameFile?: { batch_number: string; status: string }[];
      };
      if (!res.ok) {
        const detail = json.errors?.length ? json.errors.join(" ") : json.error || "Upload failed.";
        setError(detail);
        setHint(json.hint || null);
        setUploadWarnings(json.warnings ?? []);
        return;
      }
      if (json.batch) setLastUpload(json.batch);
      setUploadWarnings(json.warnings ?? []);
      const prior =
        json.priorSameFile && json.priorSameFile.length > 0
          ? ` Same file hash seen before (${json.priorSameFile.map((p) => p.batch_number).join(", ")}).`
          : "";
      setSuccess(
        `Uploaded ${json.batch?.batch_number ?? "batch"} — ${json.batch?.data_row_count ?? 0} data rows stored securely.${prior}`,
      );
      await loadBatches();
    } catch {
      setError("Network error while uploading file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onPickFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    void uploadFile(file);
  };

  const emptyCatalog =
    !loadingCatalog &&
    summary &&
    summary.departmentCount === 0 &&
    summary.courseCount === 0 &&
    summary.batchCount === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Student Management"
        title="Bulk Import Students"
        description="Download a catalog-backed template, then upload .xlsx or .csv. Mapping and dry-run come next."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={loadingCatalog}
              onClick={() => void loadCatalogSummary()}
            >
              Refresh catalog
            </Button>
            <Button
              type="button"
              disabled={!!downloading || loadingCatalog}
              onClick={() => void downloadTemplate("xlsx")}
            >
              {downloading === "xlsx" ? "Preparing…" : "Download Excel (.xlsx)"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!!downloading || loadingCatalog}
              onClick={() => void downloadTemplate("csv")}
            >
              {downloading === "csv" ? "Preparing…" : "Download CSV"}
            </Button>
          </div>
        }
      />

      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div>
      ) : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">1. Template</h2>
        {loadingCatalog ? (
          <p className="text-sm text-muted-foreground">Loading academic catalog…</p>
        ) : emptyCatalog ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>No departments, courses, or batches found in the LMS catalog.</p>
            <p>
              Add them under Academic Management → LMS Catalog, then refresh. Template Valid Values will be
              incomplete until then.
            </p>
          </div>
        ) : (
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            <li className="rounded-md bg-muted/40 px-3 py-2">
              Departments: <strong>{summary?.departmentCount ?? 0}</strong>
            </li>
            <li className="rounded-md bg-muted/40 px-3 py-2">
              Courses: <strong>{summary?.courseCount ?? 0}</strong>
            </li>
            <li className="rounded-md bg-muted/40 px-3 py-2">
              Batches: <strong>{summary?.batchCount ?? 0}</strong>
            </li>
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Template version <strong>{STUDENT_IMPORT_TEMPLATE_VERSION}</strong> · Max{" "}
          {STUDENT_IMPORT_MAX_ROWS_RECOMMENDED} data rows · Max file{" "}
          {STUDENT_IMPORT_MAX_FILE_BYTES / (1024 * 1024)} MB · .xlsx / .csv only (not .xls)
        </p>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">2. Upload file</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          onChange={(e) => onPickFiles(e.target.files)}
        />
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop student import file here"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onPickFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/20"
          } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
        >
          <p className="text-sm text-foreground">
            {uploading ? "Uploading and validating…" : "Drag and drop your filled template here"}
          </p>
          <p className="text-xs text-muted-foreground">
            Server checks file type, MIME, size, row count, and template version before storing.
          </p>
          <Button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? "Uploading…" : "Browse file"}
          </Button>
        </div>

        {uploadWarnings.length > 0 ? (
          <ul className="space-y-1 text-sm text-amber-900">
            {uploadWarnings.map((w) => (
              <li key={w} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                {w}
              </li>
            ))}
          </ul>
        ) : null}

        {lastUpload ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1">
            <p>
              <strong>{lastUpload.batch_number}</strong> · {lastUpload.file_name} · status{" "}
              <strong>{lastUpload.status}</strong>
            </p>
            <p className="text-muted-foreground">
              {lastUpload.data_row_count} data rows · template{" "}
              {lastUpload.template_version ?? "unknown"}
              {lastUpload.template_version_ok ? " (ok)" : " (not confirmed)"} · uploaded{" "}
              {new Date(lastUpload.uploaded_at).toLocaleString()}
            </p>
            {lastUpload.detected_headers && lastUpload.detected_headers.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Detected headers: {lastUpload.detected_headers.slice(0, 8).join(", ")}
                {lastUpload.detected_headers.length > 8 ? "…" : ""}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Column mapping starts in Phase 3 — this upload is stored only.
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-foreground">Recent uploads</h2>
          <Button type="button" variant="outline" size="sm" disabled={loadingBatches} onClick={() => void loadBatches()}>
            Refresh
          </Button>
        </div>
        {loadingBatches ? (
          <p className="text-sm text-muted-foreground">Loading import batches…</p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No uploads yet. Run <code className="text-xs">student_import_batches.sql</code> if the list fails to
            load, then upload a file.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Batch</th>
                  <th className="py-2 pr-3 font-medium">File</th>
                  <th className="py-2 pr-3 font-medium">Rows</th>
                  <th className="py-2 pr-3 font-medium">Version</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium">{b.batch_number}</td>
                    <td className="py-2 pr-3 truncate max-w-[200px]" title={b.file_name}>
                      {b.file_name}
                    </td>
                    <td className="py-2 pr-3">{b.data_row_count}</td>
                    <td className="py-2 pr-3">{b.template_version ?? "—"}</td>
                    <td className="py-2 pr-3">{b.status}</td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(b.uploaded_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">Required columns</h2>
        <ul className="flex flex-wrap gap-2 text-xs">
          {STUDENT_IMPORT_REQUIRED_COLUMNS.map((col) => (
            <li key={col} className="rounded-md border border-border px-2 py-1">
              {col}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">Optional columns</h2>
        <ul className="flex flex-wrap gap-2 text-xs">
          {STUDENT_IMPORT_OPTIONAL_COLUMNS.map((col) => (
            <li key={col} className="rounded-md border border-dashed border-border px-2 py-1 text-muted-foreground">
              {col}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">SQL prerequisites</p>
        <p>
          <code className="text-xs">student_portal_profile_fields.sql</code> then{" "}
          <code className="text-xs">student_import_batches.sql</code>
        </p>
        <p>Next: Phase 3 column mapping and preview (no database inserts yet).</p>
      </section>
    </div>
  );
}
