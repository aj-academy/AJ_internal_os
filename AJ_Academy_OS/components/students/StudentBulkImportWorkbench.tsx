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
import { downloadUrlInSameWindow } from "@/lib/browser/sameWindowDownload";

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

type WizardStep = 1 | 2 | 3 | 4;

const STEPS: { id: WizardStep; title: string; hint: string }[] = [
  { id: 1, title: "Upload file", hint: "Excel or CSV" },
  { id: 2, title: "Check columns", hint: "Does the data look right?" },
  { id: 3, title: "Choose how", hint: "New vs existing" },
  { id: 4, title: "Check & import", hint: "Safe check first" },
];

const MODES: { id: ImportMode; title: string; description: string; needsUpdateConfirm?: boolean }[] = [
  {
    id: "skip_duplicates",
    title: "Add new students (recommended)",
    description: "Creates new accounts. If email or registration number already exists, that row is skipped.",
  },
  {
    id: "create_only",
    title: "Add new only — fail on duplicates",
    description: "Same as above, but duplicates are treated as errors instead of quiet skips.",
  },
  {
    id: "update_only",
    title: "Update existing students only",
    description: "Updates profile fields for students already in the system. Does not create new ones.",
    needsUpdateConfirm: true,
  },
  {
    id: "create_and_update",
    title: "Add new and update existing",
    description: "Creates missing students and updates ones that already match.",
    needsUpdateConfirm: true,
  },
  {
    id: "import_valid_skip_invalid",
    title: "Import good rows, skip bad ones",
    description: "Valid rows go through; invalid rows are skipped so one bad line does not block the rest.",
  },
  {
    id: "stop_on_error",
    title: "Stop if anything is wrong",
    description: "If any row has an error, the whole import is blocked until you fix the file.",
  },
];

function StepRail({
  current,
  mappingConfirmed,
  dryDone,
}: {
  current: WizardStep;
  mappingConfirmed: boolean;
  dryDone: boolean;
}) {
  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {STEPS.map((step) => {
        const done =
          (step.id === 1 && current > 1) ||
          (step.id === 2 && mappingConfirmed) ||
          (step.id === 3 && current > 3) ||
          (step.id === 4 && dryDone);
        const active = current === step.id;
        return (
          <li
            key={step.id}
            className={[
              "rounded-2xl border px-3 py-3",
              active
                ? "border-[#c9a227] bg-[#fffdf8]"
                : done
                  ? "border-[#c9e8d4] bg-[#f0faf4]"
                  : "border-[#e8dcc8] bg-white",
            ].join(" ")}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a68b2e]">
              Step {step.id}
              {done ? " · Done" : active ? " · Now" : ""}
            </p>
            <p className="mt-1 text-sm font-semibold text-[#0f172a]">{step.title}</p>
            <p className="text-xs text-[#64748b]">{step.hint}</p>
          </li>
        );
      })}
    </ol>
  );
}

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
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [showAdvancedMapping, setShowAdvancedMapping] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [mode, setMode] = useState<ImportMode>("skip_duplicates");
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [drySummary, setDrySummary] = useState<Record<string, unknown> | null>(null);
  const [dryRows, setDryRows] = useState<unknown[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAllocateHint, setShowAllocateHint] = useState(false);

  const selectedMode = MODES.find((m) => m.id === mode) ?? MODES[0];
  const needsUpdateConfirm = !!selectedMode.needsUpdateConfirm;

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
      setSuccess("Template downloaded. Fill it, then upload below.");
    } finally {
      setDownloading(null);
    }
  };

  const openMapping = async (id: string) => {
    setBusy("mapping");
    setActiveId(id);
    setDrySummary(null);
    setDryRows([]);
    setShowAllocateHint(false);
    setShowAdvancedMapping(false);
    try {
      const res = await fetch(`/api/admin/students/import/${id}/mapping`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not load this file");
        setHint(json.hint || null);
        return;
      }
      setMappingInfo(json);
      const confirmed = Boolean(json.batch.mapping_confirmed_at);
      setMappingConfirmed(confirmed);
      setMapping(
        json.batch.column_mapping?.["Registration Number"]
          ? json.batch.column_mapping
          : json.analysis.autoMapping,
      );
      if (json.analysis.ambiguous.length > 0 || json.analysis.missingRequired.length > 0) {
        setShowAdvancedMapping(true);
      }
      setStep(confirmed ? 3 : 2);
    } finally {
      setBusy(null);
    }
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setSuccess(null);
    setHint(null);
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
      setSuccess(`File uploaded (${json.batch.batch_number}). Nothing is saved to students yet.`);
      setMappingConfirmed(false);
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
        setError(json.error || "Please fix the column matching first");
        setShowAdvancedMapping(true);
        return;
      }
      setMappingConfirmed(true);
      setDrySummary(null);
      setSuccess("Columns look good. Next: choose how to handle new vs existing students.");
      setStep(3);
      await loadBatches();
    } finally {
      setBusy(null);
    }
  };

  const runDryRun = async () => {
    if (!activeId) return;
    if (!mappingConfirmed) {
      setError("Finish Step 2 first — confirm the columns look correct.");
      setStep(2);
      return;
    }
    if (needsUpdateConfirm && !confirmUpdate) {
      setError("Tick the update confirmation box before checking the file.");
      return;
    }
    setBusy("dry-run");
    setError(null);
    setStep(4);
    try {
      const res = await fetch(`/api/admin/students/import/${activeId}/dry-run`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, confirmUpdateExisting: confirmUpdate }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Check failed");
        setHint(json.hint || null);
        return;
      }
      setDrySummary(json.summary);
      setDryRows(json.rows || []);
      if (json.priorSameFingerprint?.length) {
        setHint(
          `This same file was imported before: ${json.priorSameFingerprint.map((p: { batch_number: string }) => p.batch_number).join(", ")}`,
        );
      }
      setSuccess("Safe check finished. No students were created or updated yet.");
      await loadBatches();
    } finally {
      setBusy(null);
    }
  };

  const executeImport = async () => {
    if (!activeId) return;
    if (!drySummary) {
      setError("Run the safe check first, then import.");
      return;
    }
    if (needsUpdateConfirm && !confirmUpdate) {
      setError("Confirm updating existing students before importing.");
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
        setSuccess("Import cancelled. You can upload a new file anytime.");
        setActiveId(null);
        setMappingInfo(null);
        setDrySummary(null);
        setDryRows([]);
        setMappingConfirmed(false);
        setStep(1);
      }
      await loadBatches();
    } finally {
      setBusy(null);
    }
  };

  const downloadErrors = (only: string, format: string) => {
    if (!activeId) return;
    void downloadUrlInSameWindow(
      `/api/admin/students/import/${activeId}/errors?only=${only}&format=${format}`,
      `import-errors.${format}`,
    ).catch((e) => setError(e instanceof Error ? e.message : "Download failed"));
  };

  const headerOptions = useMemo(() => mappingInfo?.headers ?? [], [mappingInfo]);
  const dryDone = Boolean(drySummary);
  const importDisabledReason = !drySummary
    ? "Run “Check my file” first."
    : needsUpdateConfirm && !confirmUpdate
      ? "Tick the update confirmation box."
      : busy
        ? "Please wait…"
        : null;

  const summaryCards = drySummary
    ? [
        { key: "total", label: "Rows checked", tone: "neutral" },
        { key: "valid", label: "Look good", tone: "good" },
        { key: "error", label: "Need fixing", tone: "bad" },
        { key: "warning", label: "Warnings", tone: "warn" },
        { key: "create", label: "Will create", tone: "good" },
        { key: "update", label: "Will update", tone: "warn" },
        { key: "skip", label: "Will skip", tone: "neutral" },
        { key: "blocked", label: "Blocked", tone: "bad" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Student Management"
        title="Bulk Import Students"
        description="Add many portal students from one Excel or CSV file. We check everything before anything is saved."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!!downloading} onClick={() => void downloadTemplate("xlsx")}>
              {downloading === "xlsx" ? "…" : "Download Excel template"}
            </Button>
            <Button type="button" variant="secondary" disabled={!!downloading} onClick={() => void downloadTemplate("csv")}>
              CSV template
            </Button>
          </div>
        }
      />

      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div>
      ) : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <StepRail current={step} mappingConfirmed={mappingConfirmed} dryDone={dryDone} />

      {/* Step 1 */}
      <section className="rounded-2xl border border-[#e8dcc8] bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">Step 1</p>
            <h2 className="text-lg font-semibold text-[#0f172a]">Upload your filled template</h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Use the template above, fill student rows, then drop the file here. Max{" "}
              {STUDENT_IMPORT_MAX_ROWS_RECOMMENDED} rows · {STUDENT_IMPORT_MAX_FILE_BYTES / (1024 * 1024)} MB ·
              template v{STUDENT_IMPORT_TEMPLATE_VERSION}.
            </p>
          </div>
          {activeId && step !== 1 ? (
            <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => setStep(1)}>
              Show upload again
            </Button>
          ) : null}
        </div>

        {(step === 1 || !activeId) && (
          <>
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
              className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 ${
                dragOver ? "border-[#c9a227] bg-[#fffdf8]" : "border-[#e8dcc8] bg-[#fafaf7]"
              }`}
            >
              <p className="text-sm font-medium text-[#0f172a]">
                {uploading ? "Uploading…" : "Drag & drop your Excel or CSV here"}
              </p>
              <p className="text-xs text-[#64748b]">or</p>
              <Button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                Choose file
              </Button>
            </div>
          </>
        )}

        {activeId && mappingInfo && step !== 1 ? (
          <p className="rounded-xl bg-[#f8fbff] px-3 py-2 text-sm text-[#475569]">
            Using file <strong className="text-[#0f172a]">{mappingInfo.batch.file_name}</strong> ·{" "}
            {mappingInfo.totalRows} rows · batch {mappingInfo.batch.batch_number}
          </p>
        ) : null}
      </section>

      {/* Step 2 */}
      {mappingInfo && activeId ? (
        <section
          className={[
            "rounded-2xl border bg-white p-5 shadow-sm space-y-4",
            step === 2 ? "border-[#c9a227]" : "border-[#e8dcc8]",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">Step 2</p>
              <h2 className="text-lg font-semibold text-[#0f172a]">Do these columns look right?</h2>
              <p className="mt-1 text-sm text-[#64748b]">
                We matched your file headers automatically. Glance at the preview — if names, emails, and batches look
                correct, continue.
              </p>
            </div>
            {step !== 2 ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full text-xs"
                onClick={() => setStep(2)}
              >
                Review columns
              </Button>
            ) : null}
          </div>

          {step === 2 || !mappingConfirmed ? (
            <>
              {mappingInfo.analysis.ambiguous.length > 0 ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Some columns need a quick check:{" "}
                  {mappingInfo.analysis.ambiguous.map((a) => a.target).join(", ")}. Open “Fix column matching” below.
                </p>
              ) : (
                <p className="rounded-xl border border-[#c9e8d4] bg-[#f0faf4] px-3 py-2 text-sm text-[#1f6b45]">
                  Columns matched cleanly. You can continue without changing anything.
                </p>
              )}

              {mappingInfo.analysis.unknownHeaders.length > 0 ? (
                <p className="text-xs text-[#64748b]">
                  Extra columns in your file (ignored): {mappingInfo.analysis.unknownHeaders.join(", ")}
                </p>
              ) : null}

              <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
                <p className="border-b border-[#eef2f7] bg-[#f8fbff] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">
                  Preview · first {mappingInfo.previewRows.length} of {mappingInfo.totalRows} rows
                </p>
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#eef2f7] text-xs text-[#64748b]">
                      {headerOptions.slice(0, 8).map((h) => (
                        <th key={h} className="px-3 py-2 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mappingInfo.previewRows.map((r, i) => (
                      <tr key={i} className="border-b border-[#eef2f7]">
                        {headerOptions.slice(0, 8).map((h) => (
                          <td key={h} className="px-3 py-2 text-[#0f172a]">
                            {r[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-[#eef2f7] bg-[#fafaf7] px-3 py-3">
                <button
                  type="button"
                  className="text-sm font-semibold text-[#0f172a] underline-offset-2 hover:underline"
                  onClick={() => setShowAdvancedMapping((v) => !v)}
                >
                  {showAdvancedMapping ? "Hide column matching" : "Fix column matching (optional)"}
                </button>
                {showAdvancedMapping ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {STUDENT_IMPORT_ALL_COLUMNS.map((col) => (
                      <label key={col} className="flex flex-col gap-1 text-xs">
                        <span className="font-medium text-[#334155]">{col}</span>
                        <select
                          className="rounded-md border border-[#e2e8f0] bg-white px-2 py-1.5 text-sm"
                          value={mapping[col] || ""}
                          onChange={(e) => {
                            setMapping((m) => ({ ...m, [col]: e.target.value || null }));
                            setMappingConfirmed(false);
                            setDrySummary(null);
                          }}
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
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" disabled={!!busy} onClick={() => void confirmMapping()}>
                  {busy === "confirm-map" ? "Saving…" : mappingConfirmed ? "Columns confirmed — continue" : "Yes, columns look correct"}
                </Button>
                <Button type="button" variant="outline" disabled={!!busy} onClick={() => void cancelImport()}>
                  Cancel this file
                </Button>
                {mappingConfirmed ? (
                  <p className="text-sm text-[#1f6b45]">Saved. You can move to Step 3.</p>
                ) : (
                  <p className="text-sm text-[#64748b]">Nothing is imported yet — this only locks the column match.</p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-[#1f6b45]">Columns confirmed for this file.</p>
          )}
        </section>
      ) : null}

      {/* Step 3 */}
      {activeId ? (
        <section
          className={[
            "rounded-2xl border bg-white p-5 shadow-sm space-y-4",
            step === 3 ? "border-[#c9a227]" : "border-[#e8dcc8]",
            !mappingConfirmed ? "opacity-70" : "",
          ].join(" ")}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">Step 3</p>
              <h2 className="text-lg font-semibold text-[#0f172a]">How should we treat these rows?</h2>
              <p className="mt-1 text-sm text-[#64748b]">
                For a first import of new students, keep the recommended option.
              </p>
            </div>
            {mappingConfirmed && step !== 3 ? (
              <Button type="button" variant="outline" className="rounded-full text-xs" onClick={() => setStep(3)}>
                Change option
              </Button>
            ) : null}
          </div>

          {!mappingConfirmed ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Finish Step 2 first (confirm columns), then choose an option here.
            </p>
          ) : (
            <>
              <div className="grid gap-2">
                {MODES.map((m) => (
                  <label
                    key={m.id}
                    className={[
                      "flex cursor-pointer gap-3 rounded-xl border px-3 py-3",
                      mode === m.id ? "border-[#c9a227] bg-[#fffdf8]" : "border-[#eef2f7] bg-[#fafaf7]",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="mode"
                      className="mt-1"
                      checked={mode === m.id}
                      onChange={() => {
                        setMode(m.id);
                        setDrySummary(null);
                      }}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-[#0f172a]">{m.title}</span>
                      <span className="mt-0.5 block text-xs text-[#64748b]">{m.description}</span>
                    </span>
                  </label>
                ))}
              </div>

              {needsUpdateConfirm ? (
                <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={confirmUpdate}
                    onChange={(e) => {
                      setConfirmUpdate(e.target.checked);
                      setDrySummary(null);
                    }}
                  />
                  <span>
                    I understand this may update existing student profiles. Passwords, login IDs, mentors, and grades are
                    not overwritten.
                  </span>
                </label>
              ) : null}

              <Button
                type="button"
                disabled={!!busy || (needsUpdateConfirm && !confirmUpdate)}
                onClick={() => setStep(4)}
              >
                Continue to safe check
              </Button>
            </>
          )}
        </section>
      ) : null}

      {/* Step 4 */}
      {activeId ? (
        <section
          className={[
            "rounded-2xl border bg-white p-5 shadow-sm space-y-4",
            step === 4 ? "border-[#c9a227]" : "border-[#e8dcc8]",
            !mappingConfirmed ? "opacity-70" : "",
          ].join(" ")}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">Step 4</p>
            <h2 className="text-lg font-semibold text-[#0f172a]">Safe check, then import</h2>
            <p className="mt-1 text-sm text-[#64748b]">
              First we validate every row without saving. Only after that can you create or update students.
            </p>
          </div>

          {!mappingConfirmed ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Complete Steps 2 and 3 first.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={!!busy} onClick={() => void runDryRun()}>
                  {busy === "dry-run" ? "Checking…" : drySummary ? "Re-check my file" : "Check my file (no changes yet)"}
                </Button>
                <Button type="button" disabled={!!busy || !!importDisabledReason} onClick={() => void executeImport()}>
                  {busy === "execute" ? "Importing…" : "Import students now"}
                </Button>
                <Button type="button" variant="outline" disabled={!!busy} onClick={() => void cancelImport()}>
                  Cancel
                </Button>
              </div>

              {importDisabledReason ? (
                <p className="text-sm text-[#64748b]">Import is locked: {importDisabledReason}</p>
              ) : (
                <p className="text-sm text-[#1f6b45]">Ready to import. This will write student records.</p>
              )}

              {drySummary ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {summaryCards.map((card) => {
                    const value = String((drySummary as Record<string, number>)[card.key] ?? 0);
                    const toneClass =
                      card.tone === "good"
                        ? "border-[#c9e8d4] bg-[#f0faf4]"
                        : card.tone === "bad"
                          ? "border-[#f0c7c7] bg-[#fff5f5]"
                          : card.tone === "warn"
                            ? "border-amber-200 bg-amber-50"
                            : "border-[#eef2f7] bg-[#f8fbff]";
                    return (
                      <div key={card.key} className={`rounded-xl border px-3 py-3 ${toneClass}`}>
                        <p className="text-[11px] uppercase tracking-wide text-[#64748b]">{card.label}</p>
                        <p className="mt-1 text-xl font-semibold text-[#0f172a]">{value}</p>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {dryRows.length > 0 ? (
                <p className="text-xs text-[#64748b]">
                  Validation sample ready ({dryRows.length} rows). Download problem rows if needed:
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!activeId}
                  onClick={() => downloadErrors("errors", "csv")}
                >
                  Download error CSV
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!activeId}
                  onClick={() => downloadErrors("failed", "xlsx")}
                >
                  Download failed Excel
                </Button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {showAllocateHint ? (
        <section className="rounded-2xl border border-[#c9a227]/40 bg-[#fffdf8] p-5 space-y-2">
          <h2 className="text-lg font-semibold text-[#0f172a]">Next: assign mentors</h2>
          <p className="text-sm text-[#64748b]">
            Students are imported. Mentor allocation is a separate step so you can review before linking.
          </p>
          <a className="text-sm font-semibold text-[#a68b2e] underline" href="/admin/students/mentor-allocation">
            Open Mentor Allocation
          </a>
        </section>
      ) : null}

      <section className="rounded-2xl border border-[#e8dcc8] bg-white p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-[#0f172a]">Past imports</h2>
            <p className="text-sm text-[#64748b]">Re-open a batch to continue mapping or download errors.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadBatches()}>
            Refresh
          </Button>
        </div>
        {batches.length === 0 ? (
          <p className="text-sm text-[#64748b]">No imports yet. Upload a file in Step 1 to begin.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-[#64748b]">
                <tr className="border-b border-[#eef2f7]">
                  <th className="py-2 pr-2">Batch</th>
                  <th className="py-2 pr-2">File</th>
                  <th className="py-2 pr-2">Rows</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Created / Updated / Skipped / Failed</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-[#eef2f7]">
                    <td className="py-2 pr-2 font-medium text-[#0f172a]">{b.batch_number}</td>
                    <td className="py-2 pr-2 max-w-[180px] truncate">{b.file_name}</td>
                    <td className="py-2 pr-2">{b.data_row_count}</td>
                    <td className="py-2 pr-2 capitalize">{b.status.replaceAll("_", " ")}</td>
                    <td className="py-2 pr-2 text-xs text-[#475569]">
                      {b.created_count ?? 0} / {b.updated_count ?? 0} / {b.skipped_count ?? 0} / {b.failed_count ?? 0}
                    </td>
                    <td className="py-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void openMapping(b.id)}>
                        Continue
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
