"use client";

import type { CSSProperties, ReactNode } from "react";
import { TableBulkCheckbox } from "@/components/ui/TableBulkCheckbox";
import { cn } from "@/lib/utils";

type SelectAllProps = {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label?: string;
  countLabel?: string;
};

type ResponsiveDataViewProps = {
  /** Desktop / tablet table (md+) */
  desktop: ReactNode;
  /** Mobile card list (&lt; md) */
  mobile: ReactNode;
  /** Optional toolbar rendered above both views */
  toolbar?: ReactNode;
  stickyToolbar?: boolean;
  /** Mobile-only select-all row */
  selectAll?: SelectAllProps;
  className?: string;
};

/** Switches between desktop table and mobile cards without duplicating data/logic. */
export function ResponsiveDataView({
  desktop,
  mobile,
  toolbar,
  stickyToolbar = false,
  selectAll,
  className,
}: ResponsiveDataViewProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {toolbar ? (
        <div
          className={cn(
            stickyToolbar &&
              "sticky top-0 z-10 -mx-1 space-y-2 bg-[var(--background,#f8fafc)]/95 px-1 py-2 backdrop-blur-sm md:static md:bg-transparent md:p-0 md:backdrop-blur-none",
          )}
        >
          {toolbar}
        </div>
      ) : null}

      {selectAll ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e8dcc8] bg-white px-3 py-2 md:hidden">
          <label className="flex items-center gap-2 text-sm font-medium text-[#334155]">
            <TableBulkCheckbox
              checked={selectAll.checked}
              indeterminate={selectAll.indeterminate}
              onChange={selectAll.onChange}
              ariaLabel={selectAll.label || "Select all"}
            />
            {selectAll.label || "Select all"}
          </label>
          {selectAll.countLabel ? (
            <span className="text-xs text-[#64748b]">{selectAll.countLabel}</span>
          ) : null}
        </div>
      ) : null}

      <div className="hidden md:block">{desktop}</div>
      <div className="block space-y-3 md:hidden">{mobile}</div>
    </div>
  );
}

type DesktopDataTableProps = {
  children: ReactNode;
  /** Natural content min-width for horizontal scroll (e.g. "1100px") */
  minWidth?: string;
  freezeCols?: boolean;
  stickyCheckWidth?: string;
  stickyCol2Width?: string;
  className?: string;
  tableClassName?: string;
  headClassName?: string;
};

/** Horizontal-scroll desktop table shell. Does not compress columns unreadably. */
export function DesktopDataTable({
  children,
  minWidth = "1100px",
  freezeCols = false,
  stickyCheckWidth = "2.75rem",
  stickyCol2Width = "14rem",
  className,
  tableClassName,
}: DesktopDataTableProps) {
  const style = {
    ["--sticky-check-w" as string]: stickyCheckWidth,
    ["--sticky-col-2" as string]: stickyCol2Width,
    minWidth,
  } as CSSProperties;

  return (
    <div className={cn("responsive-table-wrap rounded-2xl border border-[#dbe6f3] bg-white", className)}>
      <table
        className={cn(
          "w-full text-sm",
          freezeCols && "table-freeze-cols",
          tableClassName,
        )}
        style={style}
      >
        {children}
      </table>
    </div>
  );
}

/** Narrow checkbox column — avoid min-w from data cells. */
export const TABLE_CHECK_TH =
  "sticky-col sticky-col-1 sticky-check-col w-11 min-w-11 max-w-11 px-2 py-3 text-center align-middle";
export const TABLE_CHECK_TD =
  "sticky-col sticky-col-1 sticky-check-col w-11 min-w-11 max-w-11 px-2 py-3 text-center align-middle";

/** Narrow S.No column (~60–70px). */
export const TABLE_SNO_TH =
  "sticky-col sticky-col-after-check w-16 min-w-[4rem] max-w-[4.5rem] whitespace-nowrap px-2 py-3 text-center align-middle text-[11px] font-semibold uppercase tracking-wide text-[#64748b]";
export const TABLE_SNO_TD =
  "sticky-col sticky-col-after-check w-16 min-w-[4rem] max-w-[4.5rem] whitespace-nowrap px-2 py-3 text-center align-middle text-xs text-[#334155]";

/** Standard data header/cell — apply min-width only to content columns. */
export const TABLE_DATA_TH =
  "min-w-[9rem] whitespace-nowrap px-4 py-3 text-center align-middle text-[11px] font-semibold uppercase tracking-wide text-[#64748b]";
export const TABLE_DATA_TD =
  "min-w-[9rem] whitespace-nowrap px-4 py-3 text-center align-middle text-xs text-[#334155]";
