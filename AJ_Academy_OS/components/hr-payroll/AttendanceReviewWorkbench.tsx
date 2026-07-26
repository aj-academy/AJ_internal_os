"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Issue = {
  id: string;
  employeeId: string;
  employeeName: string | null;
  department: string | null;
  attendanceDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  totalWorkingMinutes: number | null;
  rawStatus: string | null;
  derivedStatus: string;
  flags: string[];
  needsReview: boolean;
};

type PendingCorrection = {
  id: string;
  attendance_id: string | null;
  employee_id: string;
  attendance_date: string;
  original_data: Record<string, unknown> | null;
  revised_data: Record<string, unknown> | null;
  reason: string;
  status: string;
  created_at: string;
};

type EmployeeLite = { id: string; full_name: string | null; email: string | null };

type ApiPayload = {
  from: string;
  to: string;
  policyNote: string;
  issues: Issue[];
  pendingCorrections: PendingCorrection[];
  employees: EmployeeLite[];
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function monthAgoIso() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function toDatetimeLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const STATUS_OPTIONS = [
  "present",
  "half_day",
  "absent",
  "weekly_off",
  "holiday",
  "paid_leave",
  "unpaid_leave",
  "work_from_home",
  "permission",
];

export function AttendanceReviewWorkbench() {
  const [from, setFrom] = useState(monthAgoIso());
  const [to, setTo] = useState(todayIso());
  const [employeeId, setEmployeeId] = useState("");
  const [includeAll, setIncludeAll] = useState(false);

  const [data, setData] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Issue | null>(null);
  const [revCheckIn, setRevCheckIn] = useState("");
  const [revCheckOut, setRevCheckOut] = useState("");
  const [revStatus, setRevStatus] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      if (employeeId) params.set("employeeId", employeeId);
      if (includeAll) params.set("includeAll", "1");
      const res = await fetch(`/api/hr/attendance/review?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData(json as ApiPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [from, to, employeeId, includeAll]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCorrect = (issue: Issue) => {
    setEditing(issue);
    setRevCheckIn(toDatetimeLocal(issue.checkInTime));
    setRevCheckOut(toDatetimeLocal(issue.checkOutTime));
    setRevStatus(issue.derivedStatus);
    setReason("");
  };

  const submitCorrection = async () => {
    if (!editing) return;
    if (!reason.trim()) {
      setError("A correction reason is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const revised: Record<string, unknown> = {};
      revised.check_in_time = fromDatetimeLocal(revCheckIn);
      revised.check_out_time = fromDatetimeLocal(revCheckOut);
      if (revStatus) revised.status = revStatus;
      const res = await fetch("/api/hr/attendance/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendanceId: editing.id,
          employeeId: editing.employeeId,
          attendanceDate: editing.attendanceDate,
          revised,
          reason: reason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to submit correction");
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit correction");
    } finally {
      setSaving(false);
    }
  };

  const reviewCorrection = async (correctionId: string, action: "approve" | "reject") => {
    setError(null);
    try {
      const res = await fetch("/api/hr/attendance/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correctionId, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update correction");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update correction");
    }
  };

  const employees = data?.employees ?? [];
  const empName = useMemo(() => {
    const m = new Map(employees.map((e) => [e.id, e.full_name ?? e.email ?? e.id]));
    return (id: string) => m.get(id) ?? id;
  }, [employees]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        kicker="HR, Attendance & Payroll"
        title="Attendance Review"
        description="Review attendance issues (missing check-outs, late arrivals, short hours), raise corrections with a reason, and approve or reject them. All changes are audited."
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Employee
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="h-9 min-w-48 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]"
            >
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name ?? e.email ?? e.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-[#3d3428]">
            <input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} />
            Show all days
          </label>
          <Button size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {data?.policyNote ? (
        <p className="text-xs text-muted-foreground">{data.policyNote}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Attendance issues ({data?.issues.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[#e8dcc8] text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Employee</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Check-in</th>
                <th className="py-2 pr-3">Check-out</th>
                <th className="py-2 pr-3">Hours</th>
                <th className="py-2 pr-3">Derived status</th>
                <th className="py-2 pr-3">Flags</th>
                <th className="py-2 pr-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {(data?.issues ?? []).map((issue) => (
                <tr key={issue.id} className="border-b border-[#f0e9db]">
                  <td className="py-2 pr-3">{issue.employeeName ?? empName(issue.employeeId)}</td>
                  <td className="py-2 pr-3">{issue.attendanceDate}</td>
                  <td className="py-2 pr-3">{fmtTime(issue.checkInTime)}</td>
                  <td className="py-2 pr-3">{fmtTime(issue.checkOutTime)}</td>
                  <td className="py-2 pr-3">
                    {issue.totalWorkingMinutes != null
                      ? `${Math.floor(issue.totalWorkingMinutes / 60)}h ${issue.totalWorkingMinutes % 60}m`
                      : "—"}
                  </td>
                  <td className="py-2 pr-3">{issue.derivedStatus.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {issue.flags.length ? issue.flags.join(", ") : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <Button size="xs" variant="outline" onClick={() => openCorrect(issue)}>
                      Correct
                    </Button>
                  </td>
                </tr>
              ))}
              {!loading && (data?.issues.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                    No attendance issues in this range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending corrections ({data?.pendingCorrections.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(data?.pendingCorrections ?? []).map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e8dcc8] bg-[#fffdf8] px-3 py-2"
            >
              <div className="text-sm">
                <div className="font-medium text-[#3d3428]">
                  {empName(c.employee_id)} · {c.attendance_date}
                </div>
                <div className="text-xs text-muted-foreground">Reason: {c.reason}</div>
                <div className="text-xs text-muted-foreground">
                  Revised: {JSON.stringify(c.revised_data)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="xs" onClick={() => void reviewCorrection(c.id, "approve")}>
                  Approve
                </Button>
                <Button size="xs" variant="destructive" onClick={() => void reviewCorrection(c.id, "reject")}>
                  Reject
                </Button>
              </div>
            </div>
          ))}
          {(data?.pendingCorrections.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No pending corrections.</p>
          ) : null}
        </CardContent>
      </Card>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>
                Correct attendance — {editing.employeeName ?? empName(editing.employeeId)} ({editing.attendanceDate})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Revised check-in
                <input
                  type="datetime-local"
                  value={revCheckIn}
                  onChange={(e) => setRevCheckIn(e.target.value)}
                  className="h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Revised check-out
                <input
                  type="datetime-local"
                  value={revCheckOut}
                  onChange={(e) => setRevCheckOut(e.target.value)}
                  className="h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Status
                <select
                  value={revStatus}
                  onChange={(e) => setRevStatus(e.target.value)}
                  className="h-9 rounded-lg border border-[#e8dcc8] bg-white px-2 text-sm text-[#3d3428]"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                Reason (required)
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="rounded-lg border border-[#e8dcc8] bg-white px-2 py-1.5 text-sm text-[#3d3428]"
                />
              </label>
              <div className="text-xs text-muted-foreground">
                Original: in {fmtTime(editing.checkInTime)} · out {fmtTime(editing.checkOutTime)}
              </div>
            </CardContent>
            <div className="flex justify-end gap-2 px-4 pb-4">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)} disabled={saving}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void submitCorrection()} disabled={saving}>
                {saving ? "Submitting…" : "Submit correction"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
