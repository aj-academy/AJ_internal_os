"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateIST, formatTimeIST, todayDateIST } from "@/lib/datetime";
import { defaultHistoryRange, type MentorStudentAttendanceRow } from "@/lib/attendance/mentorStudentAttendance";
import { AttendanceSelfieThumb } from "@/components/attendance/AttendanceSelfieThumb";
import { TablePagination } from "@/components/ui/TablePagination";

type TodayPayload = {
  date: string;
  summary: {
    totalStudents: number;
    present: number;
    checkedIn: number;
    checkedOut: number;
    late: number;
    absent: number;
    notYetCheckedIn: number;
    onLeave: number;
    attendanceRate: number;
  };
  students: MentorStudentAttendanceRow[];
};

type HistoryPayload = {
  from: string;
  to: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: MentorStudentAttendanceRow[];
};

type Tab = "today" | "history";

export function MentorStudentAttendanceWorkbench() {
  const [tab, setTab] = useState<Tab>("today");
  const [date, setDate] = useState(todayDateIST());
  const [todayData, setTodayData] = useState<TodayPayload | null>(null);
  const [historyData, setHistoryData] = useState<HistoryPayload | null>(null);
  const rangeDefaults = useMemo(() => defaultHistoryRange(), []);
  const [from, setFrom] = useState(rangeDefaults.from);
  const [to, setTo] = useState(rangeDefaults.to);
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadToday = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mentor/student-attendance/today?date=${encodeURIComponent(date)}`, {
        credentials: "include",
      });
      const json = (await res.json()) as TodayPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load today attendance.");
      setTodayData(json);
    } catch (e) {
      setTodayData(null);
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        from,
        to,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (studentId) qs.set("studentId", studentId);
      if (status) qs.set("status", status);
      const res = await fetch(`/api/mentor/student-attendance/history?${qs}`, {
        credentials: "include",
      });
      const json = (await res.json()) as HistoryPayload & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load history.");
      setHistoryData(json);
    } catch (e) {
      setHistoryData(null);
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [from, to, page, pageSize, studentId, status]);

  useEffect(() => {
    if (tab === "today") void loadToday();
    else void loadHistory();
  }, [tab, loadToday, loadHistory]);

  const studentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of todayData?.students ?? []) {
      map.set(s.studentId, s.studentName || s.studentId);
    }
    for (const s of historyData?.rows ?? []) {
      map.set(s.studentId, s.studentName || s.studentId);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [todayData, historyData]);

  const downloadExport = async (format: "xlsx" | "pdf") => {
    setError(null);
    try {
      const qs = new URLSearchParams({ format });
      if (tab === "today") {
        qs.set("mode", "today");
        qs.set("date", date);
      } else {
        qs.set("mode", "history");
        qs.set("from", from);
        qs.set("to", to);
        if (studentId) qs.set("studentId", studentId);
        if (status) qs.set("status", status);
      }
      const res = await fetch(`/api/mentor/student-attendance/export?${qs}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "Export failed.");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] || `AJ_OS_Attendance.${format}`;
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    }
  };

  return (
    <section className="space-y-6">
      <header className="rounded-[24px] border border-[#e8dcc8] bg-gradient-to-br from-[#fffdf8] to-[#faf3e3] p-6 shadow-sm">
        <p className="text-sm font-medium text-[#a68b2e]">AJ Academy</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#3d3428]">Student Attendance</h1>
        <p className="mt-2 text-sm text-[#6b5d4d]">
          Active allotted students only (Asia/Kolkata). Personal mentor punches stay under My Attendance.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <TabButton active={tab === "today"} onClick={() => setTab("today")} label="Today" />
          <TabButton active={tab === "history"} onClick={() => setTab("history")} label="History" />
          <button
            type="button"
            onClick={() => void downloadExport("xlsx")}
            className="rounded-full border border-[#e8dcc8] bg-white px-4 py-1.5 text-sm font-semibold text-[#3d3428]"
          >
            Download Excel
          </button>
          <button
            type="button"
            onClick={() => void downloadExport("pdf")}
            className="rounded-full border border-[#e8dcc8] bg-white px-4 py-1.5 text-sm font-semibold text-[#3d3428]"
          >
            Download PDF
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>
      ) : null}

      {tab === "today" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-[#3d3428]">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#a68b2e]">Date (IST)</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl border border-[#e8dcc8] bg-white px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void loadToday()}
              className="rounded-xl bg-[#3d3428] px-4 py-2 text-sm font-semibold text-white"
            >
              Refresh
            </button>
          </div>

          {todayData ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Total Students" value={String(todayData.summary.totalStudents)} />
              <Stat label="Present / In" value={String(todayData.summary.present + todayData.summary.checkedIn)} />
              <Stat label="Not Yet Checked In" value={String(todayData.summary.notYetCheckedIn)} />
              <Stat label="Attendance Rate" value={`${todayData.summary.attendanceRate}%`} />
            </div>
          ) : null}

          <AttendanceTable
            loading={loading}
            rows={todayData?.students ?? []}
            showDate={false}
            empty="No active allotted students."
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#a68b2e]">From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setPage(1);
                  setFrom(e.target.value);
                }}
                className="rounded-xl border border-[#e8dcc8] bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#a68b2e]">To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setPage(1);
                  setTo(e.target.value);
                }}
                className="rounded-xl border border-[#e8dcc8] bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#a68b2e]">Student</span>
              <select
                value={studentId}
                onChange={(e) => {
                  setPage(1);
                  setStudentId(e.target.value);
                }}
                className="min-w-[180px] rounded-xl border border-[#e8dcc8] bg-white px-3 py-2 text-sm"
              >
                <option value="">All allotted</option>
                {studentOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#a68b2e]">Status</span>
              <select
                value={status}
                onChange={(e) => {
                  setPage(1);
                  setStatus(e.target.value);
                }}
                className="rounded-xl border border-[#e8dcc8] bg-white px-3 py-2 text-sm"
              >
                <option value="">All</option>
                <option value="present">Present</option>
                <option value="completed">Completed / Checked Out</option>
                <option value="late">Late</option>
                <option value="absent">Absent</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void loadHistory()}
              className="rounded-xl bg-[#3d3428] px-4 py-2 text-sm font-semibold text-white"
            >
              Apply
            </button>
          </div>

          <AttendanceTable
            loading={loading}
            rows={historyData?.rows ?? []}
            showDate
            empty="No attendance rows in this range for your allotted students."
          />
          {historyData ? (
            <TablePagination
              page={historyData.page}
              totalPages={historyData.totalPages}
              totalItems={historyData.total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPage(1);
                setPageSize(n);
              }}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full px-4 py-1.5 text-sm font-semibold",
        active ? "bg-[#3d3428] text-white" : "border border-[#e8dcc8] bg-white text-[#3d3428]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-[#e8dcc8] bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[#a68b2e]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#3d3428]">{value}</p>
    </article>
  );
}

function AttendanceTable({
  rows,
  loading,
  showDate,
  empty,
}: {
  rows: MentorStudentAttendanceRow[];
  loading: boolean;
  showDate: boolean;
  empty: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#e8dcc8] bg-white">
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="bg-[#faf3e3] text-[#6b5d4d]">
          <tr>
            <th className="px-3 py-3">S.No</th>
            {showDate ? <th className="px-3 py-3">Date</th> : null}
            <th className="px-3 py-3">Student</th>
            <th className="px-3 py-3">Register / Roll</th>
            <th className="px-3 py-3">Department</th>
            <th className="px-3 py-3">Course</th>
            <th className="px-3 py-3">Batch</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3">Check-in</th>
            <th className="px-3 py-3">Check-out</th>
            <th className="px-3 py-3">Location</th>
            <th className="px-3 py-3">Accuracy</th>
            <th className="px-3 py-3">Selfie</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#efe6d6] text-[#3d3428]">
          {rows.map((row, idx) => (
            <tr key={`${row.studentId}-${row.attendanceId ?? "none"}-${row.attendanceDate ?? ""}`}>
              <td className="px-3 py-3">{idx + 1}</td>
              {showDate ? <td className="px-3 py-3">{formatDateIST(row.attendanceDate)}</td> : null}
              <td className="px-3 py-3 font-medium">{row.studentName || "—"}</td>
              <td className="px-3 py-3">{row.registrationNumber || row.rollNumber || "—"}</td>
              <td className="px-3 py-3">{row.department || "—"}</td>
              <td className="px-3 py-3">{row.course || "—"}</td>
              <td className="px-3 py-3">{row.batch || "—"}</td>
              <td className="px-3 py-3">{row.attendanceStatus}</td>
              <td className="px-3 py-3">{formatTimeIST(row.checkInTime)}</td>
              <td className="px-3 py-3">{formatTimeIST(row.checkOutTime)}</td>
              <td className="max-w-[220px] px-3 py-3">
                {row.location ||
                  (row.latitude != null && row.longitude != null
                    ? `${row.latitude}, ${row.longitude}`
                    : "—")}
              </td>
              <td className="px-3 py-3">
                {row.accuracyMeters != null ? `±${Math.round(row.accuracyMeters)} m` : "—"}
              </td>
              <td className="px-3 py-3">
                {row.hasSelfie && row.attendanceId ? (
                  <AttendanceSelfieThumb
                    attendanceId={row.attendanceId}
                    alt={`${row.studentName || "Student"} selfie`}
                  />
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
          {!loading && !rows.length ? (
            <tr>
              <td colSpan={showDate ? 13 : 12} className="px-3 py-8 text-center text-[#6b5d4d]">
                {empty}
              </td>
            </tr>
          ) : null}
          {loading ? (
            <tr>
              <td colSpan={showDate ? 13 : 12} className="px-3 py-8 text-center text-[#6b5d4d]">
                Loading…
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
