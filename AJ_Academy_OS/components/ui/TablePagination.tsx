"use client";

import { Button } from "@/components/ui/button";

type TablePaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  /** When false, hide footer if all rows fit on one page. Default: always show (BB-style). */
  alwaysShow?: boolean;
  className?: string;
};

export function TablePagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  alwaysShow = true,
  className = "",
}: TablePaginationProps) {
  if (!alwaysShow && totalItems <= pageSize) return null;

  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-[#e8edf5] bg-[#f8fbff] px-4 py-3 text-sm text-[#64748b] ${className}`}
    >
      <p className="text-xs sm:text-sm">
        Showing {start}-{end} of {totalItems}
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label className="flex items-center gap-1.5 text-xs text-[#64748b]">
          Rows
          <select
            className="h-8 min-w-[3.25rem] rounded-lg border border-[#dbe6f3] bg-white px-2 text-xs font-medium text-[#334155] outline-none focus:border-[#93c5fd]"
            value={pageSize}
            disabled={!onPageSizeChange}
            onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-lg border-[#dbe6f3] bg-white px-3 text-xs font-medium text-[#334155] hover:bg-[#f1f5f9]"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="min-w-[5.5rem] text-center text-xs font-medium text-[#334155]">
          Page {page} of {Math.max(1, totalPages)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-lg border-[#dbe6f3] bg-white px-3 text-xs font-medium text-[#334155] hover:bg-[#f1f5f9]"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
