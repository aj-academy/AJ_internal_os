"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import {
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

export function StudentBulkImportWorkbench() {
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [downloading, setDownloading] = useState<"xlsx" | "csv" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [summary, setSummary] = useState<CatalogSummary | null>(null);

  const loadCatalogSummary = useCallback(async () => {
    setLoadingCatalog(true);
    setError(null);
    setHint(null);
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

  useEffect(() => {
    void loadCatalogSummary();
  }, [loadCatalogSummary]);

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
        description="Download a portal-student import template generated from your live LMS catalog. Upload and import come in the next phases."
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
        <h2 className="text-sm font-semibold tracking-wide text-foreground">Template status</h2>
        {loadingCatalog ? (
          <p className="text-sm text-muted-foreground">Loading academic catalog…</p>
        ) : emptyCatalog ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>No departments, courses, or batches found in the LMS catalog.</p>
            <p>
              Add them under Academic Management → LMS Catalog (or Departments &amp; Courses + Sync), then
              refresh. You can still download a template; Valid Values will use defaults until catalog data
              exists.
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
          Template version <strong>{STUDENT_IMPORT_TEMPLATE_VERSION}</strong> · Recommended max{" "}
          {STUDENT_IMPORT_MAX_ROWS_RECOMMENDED} rows per file · Excel includes Students, Instructions, and Valid
          Values sheets
        </p>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">Required columns</h2>
        <p className="text-xs text-muted-foreground">
          Prefixed with * in the Excel/CSV header. Names on Valid Values must match for Department, Course, and
          Batch.
        </p>
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
        <p className="font-medium text-foreground">Next phases</p>
        <p>Upload, column mapping, row validation, dry run, and transactional Auth import are not enabled yet.</p>
        <p>
          Before import execute: run <code className="text-xs">AJ_Academy_SB/student_portal_profile_fields.sql</code>{" "}
          in Supabase.
        </p>
      </section>
    </div>
  );
}
