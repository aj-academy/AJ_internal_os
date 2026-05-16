"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkDeleteAttendanceRecords,
  deleteAttendanceRecord,
} from "@/app/admin/attendance/actions";
import { MOOD_EMOJI, MOOD_LABEL } from "@/lib/moodDisplay";

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
  mood: string | null;
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

  const runDelete = (fn: () => Promise<{ ok: boolean; error?: string }>, clearSelection = false) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Delete failed.");
        return;
      }
      if (clearSelection) setSelected(new Set());
      router.refresh();
    });
  };

  const deleteOne = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    runDelete(() => deleteAttendanceRecord(fd));
  };

  const deleteSelected = () => {
    const fd = new FormData();
    selected.forEach((id) => fd.append("ids", id));
    runDelete(() => bulkDeleteAttendanceRecords(fd), true);
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
      </div>
      {error ? (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
        <table className="w-full min-w-[2000px] text-left text-sm">
          <thead>
            <tr>
              <th className="w-14">
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
                "Mood",
                "Check In Time",
                "Check Out Time",
                "Total Hours",
                "Status",
                "Location Type",
                "Check In Location",
                "Check Out Location",
                "Action",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const moodKey = row.mood?.toLowerCase() ?? "";
              return (
                <tr key={row.id}>
                  <td className="w-14">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      aria-label={`Select ${row.employeeName}`}
                    />
                  </td>
                  <td className="whitespace-nowrap">{row.employeeCode}</td>
                  <td className="font-medium text-slate-900">{row.employeeName}</td>
                  <td>{row.email}</td>
                  <td>{row.department}</td>
                  <td className="whitespace-nowrap">{row.date}</td>
                  <td className="whitespace-nowrap">
                    {row.mood ? (
                      <span className="inline-flex items-center gap-2" title={MOOD_LABEL[moodKey] ?? row.mood}>
                        <span className="text-lg leading-none" aria-hidden>
                          {MOOD_EMOJI[moodKey] ?? "🙂"}
                        </span>
                        <span className="text-xs text-[#64748b]">{MOOD_LABEL[moodKey] ?? row.mood}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-[#94a3b8]">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">{row.checkIn}</td>
                  <td className="whitespace-nowrap">{row.checkOut}</td>
                  <td className="whitespace-nowrap">{row.totalHours}</td>
                  <td>
                    <Badge value={row.status} />
                  </td>
                  <td>{row.locationType}</td>
                  <td className="min-w-[14rem] max-w-[22rem]">{row.checkInAddress}</td>
                  <td className="min-w-[14rem] max-w-[22rem]">{row.checkOutAddress}</td>
                  <td className="whitespace-nowrap">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => deleteOne(row.id)}
                      className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={15} className="py-10 text-center text-slate-500">
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
