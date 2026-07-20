"use client";

import type { ReactNode } from "react";
import { formatCallDuration, formatInr, minutesToHoursLabel } from "@/components/reports/reportsHelpers";
import type { ReportActivity, ReportCallSession, ReportFollowup, SchemaGap } from "@/lib/reports/types";
import { PRODUCTIVITY_WEIGHTS } from "@/lib/reports/productivity";

function StatCard({ title, value, loading, subtitle }: { title: string; value: string | number; loading: boolean; subtitle?: string }) {
  return (
    <article className="flex min-h-[112px] flex-col rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <p className="text-sm font-medium text-[#64748b]">{title}</p>
      {loading ? <div className="mt-2 h-8 w-24 animate-pulse rounded-md bg-[#e8edf5]" /> : <p className="mt-1 text-2xl font-semibold text-[#0f172a]">{value}</p>}
      {subtitle ? <p className="mt-1 text-xs text-[#94a3b8]">{subtitle}</p> : null}
    </article>
  );
}

function GapBanner({ gaps }: { gaps: SchemaGap[] }) {
  if (!gaps.length) return null;
  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-semibold">Schema / data notices</p>
      <ul className="list-disc space-y-1 pl-5 text-xs">
        {gaps.map((g) => (
          <li key={`${g.kind}-${g.object}-${g.reason.slice(0, 40)}`}>
            <span className="font-medium uppercase">{g.kind.replace(/_/g, " ")}</span>: {g.object} — {g.reason}
            {g.migration ? <span className="block text-amber-800">Required migration: {g.migration}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MissingValue({ label, gap }: { label: string; gap?: SchemaGap }) {
  if (!gap) return <>0</>;
  return (
    <span className="text-sm font-medium text-amber-800" title={gap.reason}>
      {label}
    </span>
  );
}

export function ReportsSchemaNotices({ gaps }: { gaps: SchemaGap[] }) {
  const actionable = gaps.filter((g) => g.kind !== "missing_activity" || gaps.length < 8);
  return <GapBanner gaps={actionable.slice(0, 12)} />;
}

export function CallReportPanel({
  loading,
  calls,
  callGap,
  durationNote,
}: {
  loading: boolean;
  calls: ReportCallSession[];
  callGap?: SchemaGap;
  durationNote: string;
}) {
  const connected = calls.filter((c) => {
    const o = (c.call_outcome || "").toLowerCase();
    return o.includes("connect") || o.includes("answered") || o === "interested" || o === "admission";
  }).length;
  const missingDuration = calls.filter((c) => c.approximate_duration_seconds == null).length;

  if (callGap && !calls.length) {
    return (
      <div className="space-y-3">
        <GapBanner gaps={[callGap]} />
        <p className="text-sm text-[#64748b]">Call Report cannot display rows until the required table/migration is applied.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="stat-cards-grid">
        <StatCard title="Total calls" value={calls.length} loading={loading} />
        <StatCard title="Connected / positive" value={connected} loading={loading} />
        <StatCard title="Duration missing" value={missingDuration} loading={loading} subtitle="Not faked — null in DB" />
        <StatCard title="Completed sessions" value={calls.filter((c) => c.session_status === "completed").length} loading={loading} />
      </div>
      <p className="text-xs text-[#64748b]">{durationNote}</p>
      <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f8fbff] text-xs uppercase text-[#64748b]">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Lead</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Outcome</th>
              <th className="px-3 py-2">Remarks</th>
              <th className="px-3 py-2">Next follow-up</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <tr key={c.id} className="border-t border-[#eef2f7]">
                <td className="px-3 py-2">{c.employee_name || c.employee_id.slice(0, 8)}</td>
                <td className="px-3 py-2">{c.lead_name || c.lead_id.slice(0, 8)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{new Date(c.started_at).toLocaleString()}</td>
                <td className="px-3 py-2">{formatCallDuration(c.approximate_duration_seconds)}</td>
                <td className="px-3 py-2">{c.call_outcome || c.session_status || "—"}</td>
                <td className="px-3 py-2 max-w-[220px] truncate">{c.notes || "—"}</td>
                <td className="px-3 py-2">{c.next_action || "—"}</td>
              </tr>
            ))}
            {!calls.length && !loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[#64748b]">
                  No call sessions in the selected date range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FollowupReportPanel({
  loading,
  followups,
  gap,
}: {
  loading: boolean;
  followups: ReportFollowup[];
  gap?: SchemaGap;
}) {
  const bucket = (b: string) => followups.filter((f) => (f.followup_bucket || "").toLowerCase() === b).length;
  const byStatus = (pred: (s: string) => boolean) =>
    followups.filter((f) => pred((f.status || "").toLowerCase())).length;

  if (gap && !followups.length) {
    return (
      <div className="space-y-3">
        <GapBanner gaps={[gap]} />
        <p className="text-sm text-[#64748b]">Follow-up Report requires lead_followups (student_lead_master_aux_schema.sql).</p>
      </div>
    );
  }

  const today = bucket("today") || byStatus((s) => s.includes("today"));
  const completed = bucket("completed") || byStatus((s) => ["completed", "done", "closed"].includes(s));
  const pending = bucket("pending") || byStatus((s) => s === "pending" || s === "");
  const missed = bucket("missed") || byStatus((s) => s.includes("miss"));
  const rescheduled = bucket("rescheduled") || byStatus((s) => s.includes("resched"));
  const overdue = bucket("overdue");
  const upcoming = bucket("upcoming");

  return (
    <div className="space-y-4">
      <div className="stat-cards-grid-5">
        <StatCard title="Today's" value={today} loading={loading} />
        <StatCard title="Completed" value={completed} loading={loading} />
        <StatCard title="Pending" value={pending} loading={loading} />
        <StatCard title="Missed" value={missed} loading={loading} />
        <StatCard title="Rescheduled" value={rescheduled} loading={loading} />
        <StatCard title="Overdue" value={overdue} loading={loading} />
        <StatCard title="Upcoming" value={upcoming} loading={loading} />
        <StatCard title="Total in range" value={followups.length} loading={loading} />
      </div>
      <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f8fbff] text-xs uppercase text-[#64748b]">
            <tr>
              <th className="px-3 py-2">Lead</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Bucket</th>
              <th className="px-3 py-2">Assignee</th>
              <th className="px-3 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {followups.map((f) => (
              <tr key={f.id} className="border-t border-[#eef2f7]">
                <td className="px-3 py-2">{f.lead_name || f.client_id.slice(0, 8)}</td>
                <td className="px-3 py-2">{f.follow_up_date || "—"}</td>
                <td className="px-3 py-2">{f.follow_up_type || "—"}</td>
                <td className="px-3 py-2">{f.status || "—"}</td>
                <td className="px-3 py-2">{f.followup_bucket || "—"}</td>
                <td className="px-3 py-2">{f.assigned_employee_name || f.assigned_employee_id?.slice(0, 8) || "—"}</td>
                <td className="px-3 py-2 max-w-[220px] truncate">{f.notes || f.reason || "—"}</td>
              </tr>
            ))}
            {!followups.length && !loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-[#64748b]">
                  No follow-ups in the selected date range.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TimelineReportPanel({
  loading,
  timeline,
  gap,
}: {
  loading: boolean;
  timeline: ReportActivity[];
  gap?: SchemaGap;
}) {
  if (gap && !timeline.length) {
    return (
      <div className="space-y-3">
        <GapBanner gaps={[gap]} />
        <p className="text-sm text-[#64748b]">
          Employee Timeline is built from real lead_activities, task_activities, attendance check-ins, and call sessions. No fake events are generated.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StatCard title="Activity events" value={timeline.length} loading={loading} subtitle="Lead · Task · Attendance · Calls" />
      <ol className="space-y-3">
        {timeline.slice(0, 200).map((ev) => (
          <li key={ev.id} className="rounded-[16px] border border-[#dbe6f3] bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-[#0f172a]">{ev.title}</p>
              <p className="text-xs text-[#94a3b8]">{new Date(ev.occurred_at).toLocaleString()}</p>
            </div>
            <p className="mt-1 text-xs text-[#64748b]">
              {ev.source} · {ev.actor_name || "—"} · {ev.entity_label || "—"}
            </p>
            {ev.detail ? <p className="mt-1 text-sm text-[#475569]">{ev.detail}</p> : null}
          </li>
        ))}
        {!timeline.length && !loading ? <p className="text-sm text-[#64748b]">No activity in this range.</p> : null}
      </ol>
    </div>
  );
}

export type DailyEmployeeRow = {
  employeeId: string;
  name: string;
  department: string;
  attendance: string;
  workingHours: string;
  calls: number;
  connected: number;
  busy: number;
  wrongNumber: number;
  interested: number;
  admissions: number;
  revenue: number;
  tasksDone: number;
  tasksTotal: number;
  crmUpdates: number;
  followups: number;
  remarks: string;
};

export function DailyEmployeePanel({
  loading,
  rows,
}: {
  loading: boolean;
  rows: DailyEmployeeRow[];
}) {
  return (
    <div className="space-y-4">
      <div className="stat-cards-grid">
        <StatCard title="Employees in report" value={rows.length} loading={loading} />
        <StatCard title="Total calls" value={rows.reduce((a, r) => a + r.calls, 0)} loading={loading} />
        <StatCard title="Admissions" value={rows.reduce((a, r) => a + r.admissions, 0)} loading={loading} />
        <StatCard title="Revenue (fees)" value={formatInr(rows.reduce((a, r) => a + r.revenue, 0))} loading={loading} />
      </div>
      <div className="overflow-x-auto rounded-[20px] border border-[#dbe6f3]">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-[#f8fbff] uppercase text-[#64748b]">
            <tr>
              {[
                "Employee",
                "Attendance",
                "Hours",
                "Calls",
                "Connected",
                "Busy",
                "Wrong #",
                "Interested",
                "Admissions",
                "Revenue",
                "Tasks",
                "CRM",
                "Follow-ups",
                "Remarks",
              ].map((h) => (
                <th key={h} className="px-2 py-2 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId} className="border-t border-[#eef2f7]">
                <td className="px-2 py-2 font-medium text-[#0f172a]">
                  {r.name}
                  <span className="block text-[10px] text-[#94a3b8]">{r.department || "—"}</span>
                </td>
                <td className="px-2 py-2">{r.attendance}</td>
                <td className="px-2 py-2">{r.workingHours}</td>
                <td className="px-2 py-2">{r.calls}</td>
                <td className="px-2 py-2">{r.connected}</td>
                <td className="px-2 py-2">{r.busy}</td>
                <td className="px-2 py-2">{r.wrongNumber}</td>
                <td className="px-2 py-2">{r.interested}</td>
                <td className="px-2 py-2">{r.admissions}</td>
                <td className="px-2 py-2">{formatInr(r.revenue)}</td>
                <td className="px-2 py-2">
                  {r.tasksDone}/{r.tasksTotal}
                </td>
                <td className="px-2 py-2">{r.crmUpdates}</td>
                <td className="px-2 py-2">{r.followups}</td>
                <td className="px-2 py-2 max-w-[160px] truncate">{r.remarks || "—"}</td>
              </tr>
            ))}
            {!rows.length && !loading ? (
              <tr>
                <td colSpan={14} className="px-3 py-6 text-center text-[#64748b]">
                  No employee activity in the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProductivityWeightsNote() {
  return (
    <p className="text-xs text-[#64748b]">
      Weights: Calls {(PRODUCTIVITY_WEIGHTS.calls * 100).toFixed(0)}% · CRM {(PRODUCTIVITY_WEIGHTS.crmUpdates * 100).toFixed(0)}% · Follow-ups{" "}
      {(PRODUCTIVITY_WEIGHTS.followups * 100).toFixed(0)}% · Tasks {(PRODUCTIVITY_WEIGHTS.tasks * 100).toFixed(0)}% · Admissions{" "}
      {(PRODUCTIVITY_WEIGHTS.admissions * 100).toFixed(0)}% · Attendance {(PRODUCTIVITY_WEIGHTS.attendance * 100).toFixed(0)}%
    </p>
  );
}

export { StatCard, GapBanner, MissingValue, minutesToHoursLabel };
export type { ReactNode };
