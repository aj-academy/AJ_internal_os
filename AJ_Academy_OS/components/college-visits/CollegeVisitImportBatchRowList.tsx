"use client";

import { Badge } from "@/components/ui/badge";
import { formatDisplayDate } from "@/lib/datetime";

export type CollegeImportBatchRow = {
  id: string;
  batch_number: string;
  file_name: string;
  row_count: number;
  new_count: number;
  duplicate_count: number;
  invalid_count: number;
  created_count: number;
  skipped_count: number;
  failed_count: number;
  status: string;
  uploaded_at: string;
  error_message?: string | null;
  isLegacy?: boolean;
};

type CollegeVisitImportBatchRowListProps = {
  batches: CollegeImportBatchRow[];
  loading?: boolean;
  onOpenBatch: (batch: CollegeImportBatchRow) => void;
};

const statusClass: Record<string, string> = {
  ready_for_review: "bg-amber-100 text-amber-800 border-amber-200",
  importing: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed_with_errors: "bg-rose-100 text-rose-700 border-rose-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
};

function statusLabel(status: string): string {
  if (status === "ready_for_review") return "Review duplicates";
  if (status === "completed_with_errors") return "Completed with errors";
  return status.replace(/_/g, " ");
}

export function CollegeVisitImportBatchRowList({
  batches,
  loading,
  onOpenBatch,
}: CollegeVisitImportBatchRowListProps) {
  if (loading) {
    return (
      <div className="rounded-[20px] border border-[#dbe6f3] bg-white px-4 py-10 text-center text-sm text-[#64748b]">
        Loading uploads…
      </div>
    );
  }

  if (!batches.length) {
    return (
      <div className="rounded-[20px] border border-[#dbe6f3] bg-white px-4 py-10 text-center text-sm text-[#64748b]">
        No file uploads yet. Use Import to upload a spreadsheet — each file appears here with duplicate preview before saving.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
      <ul className="divide-y divide-[#e8edf5]">
        {batches.map((batch) => (
          <li key={batch.id}>
            <button
              type="button"
              className="flex w-full items-stretch gap-3 px-4 py-3 text-left hover:bg-[#fafcff]"
              onClick={() => onOpenBatch(batch)}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-semibold text-[#0f172a]">
                  {batch.isLegacy ? "Manual / earlier entries" : batch.file_name}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748b]">
                  {!batch.isLegacy ? (
                    <span className="rounded-full bg-[#f1f6fc] px-2 py-0.5 font-medium text-[#475569]">
                      {batch.row_count} row{batch.row_count === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {!batch.isLegacy && batch.duplicate_count > 0 ? (
                    <span className="font-medium text-amber-700">{batch.duplicate_count} duplicate preview</span>
                  ) : null}
                  {!batch.isLegacy && batch.new_count > 0 ? (
                    <span className="font-medium text-emerald-700">{batch.new_count} new</span>
                  ) : null}
                  <span>{formatDisplayDate(batch.uploaded_at, "—")}</span>
                  {!batch.isLegacy ? <span>{batch.batch_number}</span> : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Badge className={statusClass[batch.status] ?? statusClass.ready_for_review}>
                  {batch.isLegacy ? "All colleges" : statusLabel(batch.status)}
                </Badge>
                <span className="text-xs font-semibold text-[#c9a227]">Open →</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
