"use client";

import { Badge } from "@/components/ui/badge";
import { TableBulkCheckbox } from "@/components/ui/TableBulkCheckbox";
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
  /** For visits imported before batch tracking — groups rows from the same file/upload. */
  legacyGroupKey?: string;
};

type CollegeVisitImportBatchRowListProps = {
  batches: CollegeImportBatchRow[];
  loading?: boolean;
  selection?: {
    allSelected: boolean;
    someSelected: boolean;
    isSelected: (id: string) => boolean;
    onToggleAll: () => void;
    onToggle: (id: string) => void;
  };
  onOpenBatch: (batch: CollegeImportBatchRow) => void;
};

const statusClass: Record<string, string> = {
  ready_for_review: "bg-amber-100 text-amber-800 border-amber-200",
  importing: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  completed_with_errors: "bg-rose-100 text-rose-700 border-rose-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
};

function statusLabel(batch: CollegeImportBatchRow): string {
  if (batch.status === "ready_for_review") return "Review duplicates";
  if (batch.status === "completed_with_errors") {
    if ((batch.created_count ?? 0) === 0) return "Import failed — open to retry";
    return "Completed with errors";
  }
  if (batch.status === "failed") return "Import failed — open to retry";
  return batch.status.replace(/_/g, " ");
}

export function CollegeVisitImportBatchRowList({
  batches,
  loading,
  selection,
  onOpenBatch,
}: CollegeVisitImportBatchRowListProps) {
  const showSelection = Boolean(selection);

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
      {showSelection ? (
        <div className="flex items-center gap-3 border-b border-[#e8edf5] bg-[#f8fbff] px-4 py-2">
          <TableBulkCheckbox
            checked={selection!.allSelected}
            indeterminate={selection!.someSelected}
            disabled={!batches.length}
            onChange={selection!.onToggleAll}
            ariaLabel="Select all uploads on this page"
          />
          <span className="text-xs font-medium text-[#64748b]">Select all on this page</span>
        </div>
      ) : null}
      <ul className="divide-y divide-[#e8edf5]">
        {batches.map((batch) => (
          <li key={batch.id}>
            <div className="flex items-stretch gap-3 px-4 py-3 hover:bg-[#fafcff]">
              {showSelection ? (
                <div className="flex shrink-0 items-center pt-1">
                  <TableBulkCheckbox
                    checked={selection!.isSelected(batch.id)}
                    onChange={() => selection!.onToggle(batch.id)}
                    ariaLabel={`Select upload ${batch.file_name}`}
                  />
                </div>
              ) : null}
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onOpenBatch(batch)}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-[#0f172a]">{batch.file_name}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748b]">
                      <span className="rounded-full bg-[#f1f6fc] px-2 py-0.5 font-medium text-[#475569]">
                        {batch.row_count} row{batch.row_count === 1 ? "" : "s"}
                      </span>
                      {!batch.isLegacy && batch.status === "ready_for_review" && batch.duplicate_count > 0 ? (
                        <span className="font-medium text-amber-700">{batch.duplicate_count} duplicate preview</span>
                      ) : null}
                      {!batch.isLegacy && batch.status === "ready_for_review" && batch.new_count > 0 ? (
                        <span className="font-medium text-emerald-700">{batch.new_count} new</span>
                      ) : null}
                      {!batch.isLegacy && batch.status === "completed" && batch.created_count > 0 ? (
                        <span className="font-medium text-emerald-700">{batch.created_count} imported</span>
                      ) : null}
                      <span>{formatDisplayDate(batch.uploaded_at, "—")}</span>
                      {!batch.isLegacy ? <span>{batch.batch_number}</span> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge className={statusClass[batch.status] ?? statusClass.ready_for_review}>
                      {batch.isLegacy ? "Imported" : statusLabel(batch)}
                    </Badge>
                    <span className="text-xs font-semibold text-[#c9a227]">Open →</span>
                  </div>
                </div>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
