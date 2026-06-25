"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { TablePagination } from "@/components/ui/TablePagination";
import { useDebouncedRouterRefresh } from "@/hooks/useDebouncedRouterRefresh";
import { usePagination } from "@/lib/usePagination";
import { formatDateIST, formatDateTimeIST, formatPermissionTime } from "@/lib/datetime";

export type PermissionRequestRow = {
  id: string;
  permission_date: string;
  from_time: string | null;
  to_time: string | null;
  permission_type: string | null;
  reason: string | null;
  description: string | null;
  status: string | null;
  rejection_reason: string | null;
  created_at: string;
};

function Badge({ value }: { value: string }) {
  const lowered = value.toLowerCase();
  const color =
    lowered === "approved"
      ? "bg-emerald-100 text-emerald-700"
      : lowered === "rejected"
        ? "bg-rose-100 text-rose-700"
        : "bg-amber-100 text-amber-700";
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${color}`}>{value}</span>;
}

export function PermissionRequestsTable({
  rows,
  employeeId,
}: {
  rows: PermissionRequestRow[];
  employeeId: string;
}) {
  const scheduleRefresh = useDebouncedRouterRefresh(2500);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`permission-requests-${employeeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "permission_requests",
          filter: `employee_id=eq.${employeeId}`,
        },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [employeeId, scheduleRefresh]);

  const { paginatedItems, page, setPage, totalPages, totalItems, pageSize } = usePagination(rows, 10);

  return (
    <section className="rounded-2xl border border-[#d4deea] bg-white p-4">
      <p className="mb-2 text-xs text-[#64748b]">Times shown in India (IST). Status updates automatically.</p>
      <div className="responsive-table-wrap overflow-x-auto rounded-xl border border-[#dbe6f3]">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#f1f6fc] text-[#64748b]">
            <tr>
              {[
                "Date",
                "From",
                "To",
                "Type",
                "Reason",
                "Description",
                "Status",
                "Rejection",
                "Requested on (IST)",
              ].map((h) => (
                <th key={h} className="px-3 py-3 text-xs font-semibold uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8edf5] text-slate-700">
            {paginatedItems.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-3">{formatDateIST(row.permission_date)}</td>
                <td className="px-3 py-3">{formatPermissionTime(row.from_time)}</td>
                <td className="px-3 py-3">{formatPermissionTime(row.to_time)}</td>
                <td className="px-3 py-3">{row.permission_type ?? "-"}</td>
                <td className="px-3 py-3">{row.reason ?? "-"}</td>
                <td className="max-w-[160px] truncate px-3 py-3" title={row.description ?? undefined}>
                  {row.description ?? "-"}
                </td>
                <td className="px-3 py-3">
                  <Badge value={row.status ?? "pending"} />
                </td>
                <td className="max-w-[140px] truncate px-3 py-3" title={row.rejection_reason ?? undefined}>
                  {row.rejection_reason ?? "-"}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{formatDateTimeIST(row.created_at)}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  No permission requests submitted yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TablePagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
    </section>
  );
}
