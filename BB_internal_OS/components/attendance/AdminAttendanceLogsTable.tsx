"use client";

import { useMemo, useState } from "react";
import {
  bulkDeleteAttendanceRecords,
  deleteAttendanceRecord,
} from "@/app/admin/attendance/actions";

export type AdminAttendanceLogRow = {
  id: string;
  employeeCode: string;
  employeeName: string;
  email: string;
  department: string;
  date: string;
  checkIn: string;
  checkOut: string;
  totalHours: string;
  status: string;
  locationType: string;
  checkInAddress: string;
  checkOutAddress: string;
};

function Badge({ value }: { value: string }) {
  const lowered = value.toLowerCase();
  const color =
    lowered === "approved" || lowered === "reviewed" || lowered === "completed" || lowered === "present"
      ? "bg-emerald-100 text-emerald-700"
      : lowered === "rejected" || lowered === "absent"
        ? "bg-rose-100 text-rose-700"
        : lowered === "pending"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${color}`}>{value}</span>;
}

export function AdminAttendanceLogsTable({ rows }: { rows: AdminAttendanceLogRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  return (
    <section className="rounded-2xl border border-[#d4deea] bg-white p-4">
      <form action={bulkDeleteAttendanceRecords} className="mb-3 flex flex-wrap items-center gap-2">
        {Array.from(selected).map((id) => (
          <input key={id} type="hidden" name="ids" value={id} />
        ))}
        <button
          type="submit"
          disabled={selected.size === 0}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete selected ({selected.size})
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
        <table className="w-full min-w-[1500px] text-left text-sm">
          <thead className="bg-[#f1f6fc] text-[#64748b]">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all attendance logs"
                />
              </th>
              {[
                "Employee Code",
                "Employee Name",
                "Email",
                "Department",
                "Date",
                "Check In Time",
                "Check Out Time",
                "Total Hours",
                "Status",
                "Location Type",
                "Check In Location",
                "Check Out Location",
                "Action",
              ].map((h) => (
                <th key={h} className="px-4 py-3">
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
                <td className="px-4 py-3">{row.employeeCode}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{row.employeeName}</td>
                <td className="px-4 py-3">{row.email}</td>
                <td className="px-4 py-3">{row.department}</td>
                <td className="px-4 py-3">{row.date}</td>
                <td className="px-4 py-3">{row.checkIn}</td>
                <td className="px-4 py-3">{row.checkOut}</td>
                <td className="px-4 py-3">{row.totalHours}</td>
                <td className="px-4 py-3">
                  <Badge value={row.status} />
                </td>
                <td className="px-4 py-3">{row.locationType}</td>
                <td className="max-w-[260px] px-4 py-3">{row.checkInAddress}</td>
                <td className="max-w-[260px] px-4 py-3">{row.checkOutAddress}</td>
                <td className="px-4 py-3">
                  <form action={deleteAttendanceRecord}>
                    <input type="hidden" name="id" value={row.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                    >
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-slate-500">
                  No check-in/check-out records found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
