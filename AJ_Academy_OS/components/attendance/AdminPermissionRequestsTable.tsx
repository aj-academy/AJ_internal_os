"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkDeletePermissionRequests,
  deletePermissionRequest,
  handlePermissionAction,
} from "@/app/admin/attendance/actions";
export type AdminPermissionTableRow = {
  id: string;
  employeeName: string;
  department: string;
  permissionDate: string;
  fromTime: string;
  toTime: string;
  totalHours: string;
  permissionType: string;
  reason: string;
  description: string;
  status: string;
  requestedOn: string;
  isPending: boolean;
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

export function AdminPermissionRequestsTable({ rows }: { rows: AdminPermissionTableRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const allIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(allIds));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runAction = (fn: () => Promise<{ ok: boolean; error?: string }>, clearSelection = false) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Action failed.");
        return;
      }
      if (clearSelection) setSelected(new Set());
      router.refresh();
    });
  };

  const deleteOne = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    runAction(() => deletePermissionRequest(fd));
  };

  const deleteSelected = () => {
    const fd = new FormData();
    selected.forEach((id) => fd.append("ids", id));
    runAction(() => bulkDeletePermissionRequests(fd), true);
  };

  return (
    <section className="rounded-2xl border border-[#d4deea] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={selected.size === 0 || pending}
          onClick={deleteSelected}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Deleting…" : `Delete selected (${selected.size})`}
        </button>
        <span className="text-xs text-slate-500">Select rows to remove duplicate or test requests.</span>
      </div>
      {error ? (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
        <table className="w-full min-w-[1550px] text-left text-sm">
          <thead className="bg-[#f1f6fc] text-[#64748b]">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all permission requests"
                />
              </th>
              {[
                "Employee Name",
                "Department",
                "Permission Date",
                "From Time",
                "To Time",
                "Total Hours",
                "Permission Type",
                "Reason",
                "Description",
                "Status",
                "Requested On",
                "Action",
              ].map((h) => (
                <th key={h} className="px-5 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8edf5] text-slate-700">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleOne(row.id)}
                    aria-label={`Select ${row.employeeName}`}
                  />
                </td>
                <td className="px-5 py-3 font-medium text-slate-900">{row.employeeName}</td>
                <td className="px-5 py-3">{row.department}</td>
                <td className="px-5 py-3">{row.permissionDate}</td>
                <td className="px-5 py-3">{row.fromTime}</td>
                <td className="px-5 py-3">{row.toTime}</td>
                <td className="px-5 py-3">{row.totalHours}</td>
                <td className="px-5 py-3">{row.permissionType}</td>
                <td className="px-5 py-3">{row.reason}</td>
                <td className="max-w-[240px] px-5 py-3">{row.description}</td>
                <td className="px-5 py-3">
                  <Badge value={row.status} />
                </td>
                <td className="px-5 py-3">{row.requestedOn}</td>
                <td className="px-5 py-3">
                  <div className="flex min-w-[260px] flex-col gap-2">
                    {row.isPending ? (
                      <form
                        action={async (formData) => {
                          const result = await handlePermissionAction(formData);
                          if (!result.ok) {
                            setError(result.error ?? "Action failed.");
                            return;
                          }
                          router.refresh();
                        }}
                        className="space-y-1"
                      >
                        <input type="hidden" name="id" value={row.id} />
                        <input
                          name="rejection_reason"
                          placeholder="Rejection reason (optional)"
                          className="h-8 w-full rounded-md border border-[#cfdceb] px-2 text-xs"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            name="action"
                            value="approved"
                            data-requires-online
                            disabled={pending}
                            className="cursor-pointer rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            name="action"
                            value="rejected"
                            data-requires-online
                            disabled={pending}
                            className="cursor-pointer rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p className="text-xs text-slate-500">Action completed</p>
                    )}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => deleteOne(row.id)}
                      className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-slate-500">
                  No permission requests found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
