"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CrmFlash } from "@/components/ui/CrmFlash";
import { formatDisplayDate } from "@/lib/datetime";
import type { CollegeVisitFormValue, CollegeVisitRow } from "@/components/college-visits/collegeVisitsHelpers";
import { COLLEGE_VISIT_CSV_HEADERS } from "@/components/college-visits/collegeVisitsCsv";
import type { CollegeImportBatchRow } from "@/components/college-visits/CollegeVisitImportBatchRowList";

type ImportStagingRow = {
  id: string;
  row_number: number;
  payload: CollegeVisitFormValue;
  status: string;
  duplicate_of: string | null;
  error_message: string | null;
};

type CollegeVisitImportDetailWorkbenchProps = {
  batch: CollegeImportBatchRow;
  completedVisits: CollegeVisitRow[];
  ownerNameMap: Record<string, string>;
  onClose: () => void;
  onReload: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
};

function dash(v: unknown) {
  return v == null || v === "" ? "—" : String(v);
}

export function CollegeVisitImportDetailWorkbench({
  batch,
  completedVisits,
  ownerNameMap,
  onClose,
  onReload,
  onSuccess,
  onError,
}: CollegeVisitImportDetailWorkbenchProps) {
  const [stagingRows, setStagingRows] = useState<ImportStagingRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(!batch.isLegacy);
  const [executing, setExecuting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isPreview = !batch.isLegacy && batch.status === "ready_for_review";

  useEffect(() => {
    if (batch.isLegacy) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/college-visits/import/${batch.id}`, { credentials: "include" });
        const json = (await res.json()) as {
          rows?: ImportStagingRow[];
          batch?: { meta?: { parse_errors?: string[] } };
          error?: string;
        };
        if (!res.ok) throw new Error(json.error || "Could not load import preview.");
        if (!cancelled) {
          setStagingRows(json.rows ?? []);
          setParseErrors((json.batch?.meta?.parse_errors as string[] | undefined) ?? []);
        }
      } catch (e) {
        if (!cancelled) onError(e instanceof Error ? e.message : "Could not load import preview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batch.id, batch.isLegacy, onError]);

  const duplicateRows = useMemo(
    () => stagingRows.filter((r) => r.status === "duplicate"),
    [stagingRows],
  );
  const newRows = useMemo(() => stagingRows.filter((r) => r.status === "pending"), [stagingRows]);

  const handleExecute = async () => {
    if (!isPreview || !newRows.length) {
      setLocalError("No new rows to import. All rows are duplicates or invalid.");
      return;
    }
    setExecuting(true);
    setLocalError(null);
    try {
      const res = await fetch(`/api/college-visits/import/${batch.id}/execute`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { error?: string; created?: number; skipped?: number; failed?: number };
      if (!res.ok) throw new Error(json.error || "Import failed.");
      onSuccess(
        `Import complete: ${json.created ?? 0} added, ${json.skipped ?? 0} duplicate(s) skipped${json.failed ? `, ${json.failed} failed` : ""}.`,
      );
      onReload();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed.";
      setLocalError(msg);
      onError(msg);
    } finally {
      setExecuting(false);
    }
  };

  const tableHeaders = ["Status", ...COLLEGE_VISIT_CSV_HEADERS.filter((h) => h !== "S.No")];

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#f4f7fb]">
      <div className="mx-auto max-w-[1680px] space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" className="rounded-full border-[#dbe6f3]" onClick={onClose}>
            ← Back to uploads
          </Button>
          {isPreview ? (
            <Button
              type="button"
              className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
              disabled={executing || !newRows.length}
              onClick={() => void handleExecute()}
            >
              {executing ? "Importing…" : `Import ${newRows.length} new college${newRows.length === 1 ? "" : "s"}`}
            </Button>
          ) : null}
        </div>

        <section className="rounded-2xl border border-[#c9a227] bg-[#fffdf8] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">College visit upload</p>
          <h2 className="mt-1 text-2xl font-semibold text-[#0f172a]">{batch.file_name}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {!batch.isLegacy ? <Badge className="border-[#dbe6f3] bg-white">{batch.batch_number}</Badge> : null}
            <Badge className="border-[#dbe6f3] bg-white">{formatDisplayDate(batch.uploaded_at, "—")}</Badge>
            {!batch.isLegacy ? (
              <>
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">{batch.new_count} new</Badge>
                <Badge className="border-amber-200 bg-amber-50 text-amber-800">{batch.duplicate_count} duplicates</Badge>
                {batch.invalid_count > 0 ? (
                  <Badge className="border-rose-200 bg-rose-50 text-rose-800">{batch.invalid_count} invalid</Badge>
                ) : null}
              </>
            ) : (
              <Badge className="border-[#dbe6f3] bg-white">{completedVisits.length} colleges</Badge>
            )}
          </div>
        </section>

        {localError ? <CrmFlash tone="error" message={localError} onDismiss={() => setLocalError(null)} /> : null}

        {isPreview && duplicateRows.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>{duplicateRows.length} row(s)</strong> match colleges already in the system (or repeat within this file).
            They are highlighted below and will be skipped on import. Uploading the same file again should show this preview
            before anything is saved.
          </div>
        ) : null}

        {parseErrors.length > 0 ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <p className="font-semibold">Parse warnings ({parseErrors.length})</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {parseErrors.slice(0, 8).map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="rounded-2xl border border-[#dbe6f3] bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">Full table view</p>
          <h3 className="text-lg font-semibold text-[#0f172a]">
            {isPreview ? "Duplicate preview — all columns" : "Imported colleges — all columns"}
          </h3>
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#dbe6f3]">
            <table className="w-full min-w-[2800px] text-xs">
              <thead className="bg-[#f8fbff]">
                <tr>
                  {tableHeaders.map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-center font-semibold uppercase text-[#64748b]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={tableHeaders.length} className="px-4 py-8 text-center text-[#64748b]">
                      Loading preview…
                    </td>
                  </tr>
                ) : batch.isLegacy || batch.status !== "ready_for_review" ? (
                  completedVisits.length ? (
                    completedVisits.map((row, idx) => (
                      <tr key={row.id} className="border-t border-[#eef2f7] hover:bg-[#fafcff]">
                        <td className="px-3 py-2 text-center">Saved</td>
                        <td className="px-3 py-2 text-center">{idx + 1}</td>
                        <td className="px-3 py-2">{dash(row.college_name)}</td>
                        <td className="px-3 py-2">{dash(row.location)}</td>
                        <td className="px-3 py-2">{dash(row.contact_number)}</td>
                        <td className="px-3 py-2">—</td>
                        <td className="px-3 py-2">—</td>
                        <td className="px-3 py-2">{dash(row.email)}</td>
                        <td className="px-3 py-2">{dash(row.connected_person_name)}</td>
                        <td className="px-3 py-2">{dash(row.connected_person_role)}</td>
                        <td className="px-3 py-2" colSpan={12}>
                          …
                        </td>
                        <td className="px-3 py-2">{dash(row.visit_status)}</td>
                        <td className="px-3 py-2">{formatDisplayDate(row.visit_date, "—")}</td>
                        <td className="px-3 py-2">{dash(row.visited_by)}</td>
                        <td className="px-3 py-2">{dash(row.mou_signed_status)}</td>
                        <td className="px-3 py-2">{dash(row.follow_up_stage)}</td>
                        <td className="px-3 py-2">{formatDisplayDate(row.last_follow_up_date, "—")}</td>
                        <td className="px-3 py-2">{formatDisplayDate(row.next_follow_up_date, "—")}</td>
                        <td className="px-3 py-2">{dash(row.priority)}</td>
                        <td className="px-3 py-2">
                          {row.assigned_to ? ownerNameMap[row.assigned_to] || row.assigned_to.slice(0, 8) : "—"}
                        </td>
                        <td className="px-3 py-2">{dash(row.description)}</td>
                        <td className="px-3 py-2">{dash(row.last_outcome_remarks)}</td>
                        <td className="px-3 py-2">—</td>
                        <td className="px-3 py-2">—</td>
                        <td className="px-3 py-2">{dash(row.lead_score)}</td>
                        <td className="px-3 py-2">{dash(row.final_status)}</td>
                        <td className="px-3 py-2">{dash(row.source_reference)}</td>
                        <td className="px-3 py-2">{dash(row.proposal_status)}</td>
                        <td className="px-3 py-2">{dash(row.proposal_amount)}</td>
                        <td className="px-3 py-2">{formatDisplayDate(row.proposal_sent_date, "—")}</td>
                        <td className="px-3 py-2">{dash(row.proposal_link)}</td>
                        <td className="px-3 py-2">{dash(row.proposal_pdf_url)}</td>
                        <td className="px-3 py-2">{dash(row.proposal_pdf_name)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={tableHeaders.length} className="px-4 py-8 text-center text-[#64748b]">
                        No colleges in this upload yet.
                      </td>
                    </tr>
                  )
                ) : stagingRows.length ? (
                  stagingRows.map((row) => {
                    const f = row.payload;
                    const dup = row.status === "duplicate";
                    return (
                      <tr
                        key={row.id}
                        className={dup ? "border-t border-amber-100 bg-amber-50/80" : "border-t border-[#eef2f7] hover:bg-[#fafcff]"}
                      >
                        <td className="px-3 py-2 text-center font-medium text-amber-800">
                          {dup ? "Duplicate" : row.status === "pending" ? "New" : row.status}
                        </td>
                        <td className="px-3 py-2 text-center">{row.row_number}</td>
                        <td className="px-3 py-2 font-medium">{dash(f.college_name)}</td>
                        <td className="px-3 py-2">{dash(f.location)}</td>
                        <td className="px-3 py-2">{dash(f.contact_number)}</td>
                        <td className="px-3 py-2">—</td>
                        <td className="px-3 py-2">—</td>
                        <td className="px-3 py-2">{dash(f.email)}</td>
                        <td className="px-3 py-2">{dash(f.connected_person_name)}</td>
                        <td className="px-3 py-2">{dash(f.connected_person_role)}</td>
                        <td className="px-3 py-2" colSpan={12}>
                          {dup && row.error_message ? row.error_message : "—"}
                        </td>
                        <td className="px-3 py-2">{dash(f.visit_status)}</td>
                        <td className="px-3 py-2">{dash(f.visit_date)}</td>
                        <td className="px-3 py-2">{dash(f.visited_by)}</td>
                        <td className="px-3 py-2">{dash(f.mou_signed_status)}</td>
                        <td className="px-3 py-2">{dash(f.follow_up_stage)}</td>
                        <td className="px-3 py-2">{dash(f.last_follow_up_date)}</td>
                        <td className="px-3 py-2">{dash(f.next_follow_up_date)}</td>
                        <td className="px-3 py-2">{dash(f.priority)}</td>
                        <td className="px-3 py-2">—</td>
                        <td className="px-3 py-2">{dash(f.description)}</td>
                        <td className="px-3 py-2">{dash(f.last_outcome_remarks)}</td>
                        <td className="px-3 py-2">—</td>
                        <td className="px-3 py-2">—</td>
                        <td className="px-3 py-2">{dash(f.lead_score)}</td>
                        <td className="px-3 py-2">{dash(f.final_status)}</td>
                        <td className="px-3 py-2">{dash(f.source_reference)}</td>
                        <td className="px-3 py-2">{dash(f.proposal_status)}</td>
                        <td className="px-3 py-2">{dash(f.proposal_amount)}</td>
                        <td className="px-3 py-2">{dash(f.proposal_sent_date)}</td>
                        <td className="px-3 py-2">{dash(f.proposal_link)}</td>
                        <td className="px-3 py-2">{dash(f.proposal_pdf_url)}</td>
                        <td className="px-3 py-2">{dash(f.proposal_pdf_name)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={tableHeaders.length} className="px-4 py-8 text-center text-[#64748b]">
                      No rows in this upload.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
