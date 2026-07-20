"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { AnalyticsFiltersBar } from "@/components/analytics/AnalyticsFiltersBar";
import {
  ANALYTICS_SECTION_LABELS,
  ANALYTICS_SECTION_ORDER,
  EMPTY_ANALYTICS_FILTERS,
  type AnalyticsFilters,
  type AnalyticsSectionId,
} from "@/lib/analytics/types";
import { resolveDateRange } from "@/lib/analytics/dateRanges";
import { formatInr } from "@/components/reports/reportsHelpers";
import {
  exportMultiSheetExcel,
  exportRowsAsCsv,
  exportRowsAsExcel,
  exportRowsAsPdf,
  type ExportRow,
} from "@/components/reports/reportsExport";

function StatCard({
  title,
  value,
  loading,
  subtitle,
}: {
  title: string;
  value: string | number;
  loading?: boolean;
  subtitle?: string;
}) {
  return (
    <article className="flex min-h-[104px] flex-col rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <p className="text-sm font-medium text-[#64748b]">{title}</p>
      {loading ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded-md bg-[#e8edf5]" />
      ) : (
        <p className="mt-1 text-2xl font-semibold text-[#0f172a]">{value}</p>
      )}
      {subtitle ? <p className="mt-1 text-xs text-[#94a3b8]">{subtitle}</p> : null}
    </article>
  );
}

function BandBadge({ band, score }: { band: string; score: number }) {
  const cls =
    band === "green"
      ? "bg-emerald-100 text-emerald-800"
      : band === "yellow"
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {score}% · {band}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#dbe6f3] bg-[#fafcff] px-4 py-10 text-center text-sm text-[#64748b]">
      {text}
    </div>
  );
}

function DataTable({
  columns,
  rows,
}: {
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}) {
  if (!rows.length) return <EmptyState text="No rows for the selected filters." />;
  return (
    <div className="overflow-hidden rounded-[20px] border border-[#dbe6f3] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-[#f1f6fc]">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#64748b]"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8edf5]">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-[#fafcff]">
                {columns.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-3 py-2 text-[#334155]">
                    {row[c.key] == null || row[c.key] === "" ? "-" : String(row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Viewer = { role: string; id: string; scope: string };

export function AnalyticsWorkbench({
  mode = "admin",
}: {
  mode?: "admin" | "employee";
}) {
  const isEmployee = mode === "employee";
  const [section, setSection] = useState<AnalyticsSectionId>("overview");
  const [filters, setFilters] = useState<AnalyticsFilters>(() => {
    const range = resolveDateRange("today");
    return { ...EMPTY_ANALYTICS_FILTERS, ...range };
  });
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [filterOpts, setFilterOpts] = useState<{
    employees: { id: string; label: string; department?: string | null; role?: string | null }[];
    departments: string[];
    roles: string[];
  }>({ employees: [], departments: [], roles: [] });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/query", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          preset: filters.preset,
          from: filters.from,
          to: filters.to,
          employeeId: filters.employeeId || undefined,
          department: filters.department || undefined,
          role: filters.role || undefined,
          course: filters.course || undefined,
          leadSource: filters.leadSource || undefined,
          leadStatus: filters.leadStatus || undefined,
          taskStatus: filters.taskStatus || undefined,
          admissionStatus: filters.admissionStatus || undefined,
          search: filters.search || undefined,
          page: filters.page,
          pageSize: filters.pageSize,
        }),
      });
      const json = (await res.json()) as Record<string, unknown> & { error?: string; viewer?: Viewer; filterOptions?: typeof filterOpts };
      if (!res.ok) throw new Error(json.error || "Failed to load report.");
      setData(json);
      if (json.viewer) setViewer(json.viewer);
      if (json.filterOptions) {
        const fo = json.filterOptions as {
          employees?: typeof filterOpts.employees;
          departments?: string[];
          roles?: string[];
        };
        setFilterOpts({
          employees: fo.employees ?? [],
          departments: fo.departments ?? [],
          roles: fo.roles ?? [],
        });
      }
      if (isEmployee && json.viewer?.id) {
        setFilters((prev) => (prev.employeeId === json.viewer!.id ? prev : { ...prev, employeeId: json.viewer!.id }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters, isEmployee, section]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = (data?.kpis || {}) as Record<string, number>;
  const charts = (data?.charts || {}) as Record<string, unknown>;
  const employees = (data?.employees || []) as Record<string, unknown>[];
  const team = (data?.team || {}) as Record<string, unknown>;
  const accountability = (data?.accountability || []) as { employeeName: string; issues: string[]; productivityScore: number }[];

  const exportCurrent = async (fmt: "csv" | "xlsx" | "pdf") => {
    setExportBusy(fmt);
    try {
      const stamp = `${filters.from}_to_${filters.to}`;
      let rows: ExportRow[] = [];
      let title = ANALYTICS_SECTION_LABELS[section];

      if (section === "calls") {
        rows = ((data?.allRows || data?.rows || []) as ExportRow[]) ?? [];
      } else if (section === "followups" || section === "tasks") {
        rows = ((data?.rows || []) as ExportRow[]) ?? [];
      } else if (section === "conversion") {
        rows = ((data?.rows || []) as ExportRow[]) ?? [];
      } else if (section === "admissions" || section === "revenue") {
        rows = ((data?.byEmployee || data?.detailRows || []) as ExportRow[]) ?? [];
      } else if (section === "timeline") {
        rows = ((data?.events || []) as ExportRow[]) ?? [];
      } else if (section === "eod") {
        rows = ((data?.rows || []) as ExportRow[]) ?? [];
      } else if (section === "download") {
        const daily = ((data?.daily as { employees?: ExportRow[] })?.employees || []) as ExportRow[];
        const callRows = ((data?.calls as { allRows?: ExportRow[] })?.allRows || []) as ExportRow[];
        const taskRows = ((data?.tasks as { rows?: ExportRow[] })?.rows || []) as ExportRow[];
        const eodRows = ((data?.eod as { rows?: ExportRow[] })?.rows || []) as ExportRow[];
        await exportMultiSheetExcel(`AJ_OS_Analytics_${stamp}.xlsx`, [
          { name: "Daily Employees", rows: daily },
          { name: "Calls", rows: callRows },
          { name: "Tasks", rows: taskRows },
          { name: "EOD", rows: eodRows },
        ]);
        return;
      } else {
        rows = employees as ExportRow[];
      }

      if (!rows.length) {
        setError("Nothing to export for the current filters.");
        return;
      }

      const metaPrefix = [
        { Report: title, From: filters.from, To: filters.to, Generated: new Date().toLocaleString("en-IN") },
      ];

      if (fmt === "csv") exportRowsAsCsv(`AJ_OS_${section}_${stamp}.csv`, rows);
      else if (fmt === "xlsx") await exportRowsAsExcel(`AJ_OS_${section}_${stamp}.xlsx`, [...metaPrefix, ...rows]);
      else await exportRowsAsPdf(`AJ OS — ${title}`, `AJ_OS_${section}_${stamp}.pdf`, rows);
    } finally {
      setExportBusy(null);
    }
  };

  const sections = useMemo(
    () =>
      ANALYTICS_SECTION_ORDER.filter((id) => {
        if (!isEmployee) return true;
        return !["team", "download"].includes(id) || id === "download";
      }),
    [isEmployee],
  );

  return (
    <section className="space-y-5 rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-[0_20px_40px_rgba(30,64,175,0.08)] sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-[#0f172a]">Reports &amp; Analytics</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {isEmployee
              ? "Your productivity, calls, follow-ups, tasks, and end-of-day reports."
              : "Enterprise visibility into employee productivity, CRM discipline, admissions, and revenue — live from AJ OS data."}
          </p>
          {viewer ? (
            <p className="mt-1 text-xs text-[#94a3b8]">
              Scope: {viewer.scope === "self" ? "Own reports only" : "Company-wide"} · {filters.from} → {filters.to}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!!exportBusy || loading}
            className="h-9 rounded-full border-[#e8dcc8] px-3 text-xs"
            onClick={() => void exportCurrent("csv")}
          >
            {exportBusy === "csv" ? "…" : "CSV"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!!exportBusy || loading}
            className="h-9 rounded-full border-[#e8dcc8] px-3 text-xs"
            onClick={() => void exportCurrent("xlsx")}
          >
            {exportBusy === "xlsx" ? "…" : "Excel"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!!exportBusy || loading}
            className="h-9 rounded-full border-[#e8dcc8] px-3 text-xs"
            onClick={() => void exportCurrent("pdf")}
          >
            {exportBusy === "pdf" ? "…" : "PDF"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full border-[#e8dcc8] px-3 text-xs"
            onClick={() => window.print()}
          >
            Print
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {sections.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={
              section === id
                ? "rounded-full bg-[#c9a227] px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                : "rounded-full border border-[#e8dcc8] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b] hover:bg-[#f8fbff]"
            }
          >
            {ANALYTICS_SECTION_LABELS[id]}
          </button>
        ))}
      </div>

      <AnalyticsFiltersBar
        filters={filters}
        onChange={setFilters}
        employees={filterOpts.employees}
        departments={filterOpts.departments}
        roles={filterOpts.roles}
        lockEmployee={isEmployee}
        onRefresh={() => void load()}
        loading={loading}
      />

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {section === "overview" ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <StatCard title="Total Employees" value={kpis.totalEmployees ?? 0} loading={loading} />
            <StatCard title="Present" value={kpis.employeesPresent ?? 0} loading={loading} />
            <StatCard title="Working Now" value={kpis.employeesWorking ?? 0} loading={loading} />
            <StatCard title="Checked Out" value={kpis.employeesCheckedOut ?? 0} loading={loading} />
            <StatCard title="Leads Assigned" value={kpis.totalLeadsAssigned ?? 0} loading={loading} />
            <StatCard title="Total Calls" value={kpis.totalCalls ?? 0} loading={loading} />
            <StatCard title="Connected Calls" value={kpis.connectedCalls ?? 0} loading={loading} />
            <StatCard title="Pending Follow-ups" value={kpis.pendingFollowups ?? 0} loading={loading} />
            <StatCard title="Admissions" value={kpis.admissions ?? 0} loading={loading} />
            <StatCard title="Revenue" value={formatInr(kpis.revenueGenerated ?? 0)} loading={loading} />
            <StatCard title="Pending Revenue" value={formatInr(kpis.pendingRevenue ?? 0)} loading={loading} />
            <StatCard title="Tasks Completed" value={kpis.tasksCompleted ?? 0} loading={loading} />
            <StatCard title="Tasks Pending" value={kpis.tasksPending ?? 0} loading={loading} />
            <StatCard title="Avg Productivity" value={`${kpis.averageProductivity ?? 0}%`} loading={loading} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Calls trend">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={(charts.callsByDay as object[]) || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8edf5" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="calls" stroke="#1e3a5f" strokeWidth={2} name="Calls" />
                  <Line type="monotone" dataKey="connected" stroke="#c9a227" strokeWidth={2} name="Connected" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Admissions & revenue">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={(charts.admissionsByDay as object[]) || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8edf5" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="admissions" fill="#1e3a5f" name="Admissions" />
                  <Bar dataKey="revenue" fill="#c9a227" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Lead conversion funnel">
              <FunnelBars funnel={(charts.funnel as Record<string, number>) || {}} />
            </ChartCard>
            <ChartCard title="Employee performance ranking">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={(charts.ranking as object[]) || []} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8edf5" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="score" fill="#c9a227" name="Productivity %" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {accountability.length ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#0f172a]">Accountability alerts</h3>
              <DataTable
                columns={[
                  { key: "employeeName", label: "Employee" },
                  { key: "issues", label: "Issues" },
                  { key: "productivityScore", label: "Score" },
                ]}
                rows={accountability.map((a) => ({
                  employeeName: a.employeeName,
                  issues: (a.issues || []).join("; "),
                  productivityScore: a.productivityScore,
                }))}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {section === "daily" || section === "productivity" ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#0f172a]">
            {section === "daily" ? "Daily employee scorecard" : "Productivity ranking"}
          </h3>
          <DataTable
            columns={[
              { key: "employeeName", label: "Employee" },
              { key: "department", label: "Department" },
              { key: "attendanceStatus", label: "Attendance" },
              { key: "checkIn", label: "Check In" },
              { key: "checkOut", label: "Check Out" },
              { key: "workingHours", label: "Hours" },
              { key: "assignedLeads", label: "Leads" },
              { key: "callsAttempted", label: "Calls" },
              { key: "callsConnected", label: "Connected" },
              { key: "admissions", label: "Admissions" },
              { key: "revenue", label: "Revenue" },
              { key: "tasksCompleted", label: "Tasks Done" },
              { key: "tasksPending", label: "Tasks Pending" },
              { key: "overdueTasks", label: "Overdue" },
              { key: "crmUpdates", label: "CRM Updates" },
              { key: "followupsPending", label: "FU Pending" },
              { key: "scoreLabel", label: "Productivity" },
            ]}
            rows={employees.map((e) => ({
              ...e,
              checkIn: e.checkIn ? String(e.checkIn).slice(11, 16) : "-",
              checkOut: e.checkOut ? String(e.checkOut).slice(11, 16) : "-",
              revenue: formatInr(Number(e.revenue || 0)),
              scoreLabel: `${e.productivityScore}% (${e.productivityBand})`,
            }))}
          />
        </div>
      ) : null}

      {section === "team" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Employees" value={Number(team.totalEmployees || 0)} loading={loading} />
            <StatCard title="Calls" value={Number(team.totalCalls || 0)} loading={loading} />
            <StatCard title="Connected" value={Number(team.connectedCalls || 0)} loading={loading} />
            <StatCard title="Admissions" value={Number(team.admissions || 0)} loading={loading} />
            <StatCard title="Revenue" value={formatInr(Number(team.revenue || 0))} loading={loading} />
            <StatCard title="Pending Follow-ups" value={Number(team.pendingFollowups || 0)} loading={loading} />
            <StatCard title="Pending Tasks" value={Number(team.pendingTasks || 0)} loading={loading} />
            <StatCard title="Avg Productivity" value={`${Number(team.averageProductivity || 0)}%`} loading={loading} />
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <HighlightCard label="Top performer" person={team.topPerformer as Record<string, unknown> | null} />
            <HighlightCard label="Least active" person={team.leastActive as Record<string, unknown> | null} />
            <HighlightCard label="Most revenue" person={team.mostRevenue as Record<string, unknown> | null} metric="revenue" />
            <HighlightCard label="Most admissions" person={team.mostAdmissions as Record<string, unknown> | null} metric="admissions" />
            <HighlightCard label="Most calls" person={team.mostCalls as Record<string, unknown> | null} metric="callsAttempted" />
          </div>
        </div>
      ) : null}

      {section === "calls" ? (
        <DataTable
          columns={[
            { key: "employee", label: "Employee" },
            { key: "leadName", label: "Lead" },
            { key: "mobile", label: "Mobile" },
            { key: "date", label: "Date" },
            { key: "time", label: "Time" },
            { key: "durationSec", label: "Duration (s)" },
            { key: "outcome", label: "Outcome" },
            { key: "remarks", label: "Remarks" },
            { key: "nextFollowUp", label: "Next Follow-up" },
            { key: "status", label: "Status" },
          ]}
          rows={((data?.rows || []) as Record<string, unknown>[]) ?? []}
        />
      ) : null}

      {section === "followups" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {Object.entries((data?.summary as Record<string, number>) || {}).map(([k, v]) => (
              <StatCard key={k} title={k} value={v} loading={loading} />
            ))}
          </div>
          <DataTable
            columns={[
              { key: "employee", label: "Employee" },
              { key: "leadName", label: "Lead" },
              { key: "mobile", label: "Mobile" },
              { key: "date", label: "Date" },
              { key: "time", label: "Time" },
              { key: "type", label: "Type" },
              { key: "status", label: "Status" },
              { key: "bucket", label: "Bucket" },
              { key: "outcome", label: "Outcome" },
            ]}
            rows={((data?.rows || []) as Record<string, unknown>[]) ?? []}
          />
        </div>
      ) : null}

      {section === "tasks" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard title="Total" value={Number(data?.total || 0)} loading={loading} />
            <StatCard title="Completed" value={Number(data?.completed || 0)} loading={loading} />
            <StatCard title="Pending" value={Number(data?.pending || 0)} loading={loading} />
            <StatCard title="Overdue" value={Number(data?.overdue || 0)} loading={loading} />
          </div>
          <DataTable
            columns={[
              { key: "task", label: "Task" },
              { key: "assignedBy", label: "Assigned By" },
              { key: "assignedTo", label: "Assigned To" },
              { key: "priority", label: "Priority" },
              { key: "deadline", label: "Deadline" },
              { key: "status", label: "Status" },
              { key: "progress", label: "%" },
              { key: "completionTime", label: "Completed At" },
            ]}
            rows={((data?.rows || []) as Record<string, unknown>[]) ?? []}
          />
        </div>
      ) : null}

      {section === "conversion" ? (
        <DataTable
          columns={[
            { key: "source", label: "Source" },
            { key: "generated", label: "Generated" },
            { key: "qualified", label: "Qualified" },
            { key: "interested", label: "Interested" },
            { key: "admission", label: "Admission" },
            { key: "revenue", label: "Revenue" },
            { key: "conversionPct", label: "Conversion %" },
          ]}
          rows={(((data?.rows || []) as Record<string, unknown>[]) ?? []).map((r) => ({
            ...r,
            revenue: formatInr(Number(r.revenue || 0)),
          }))}
        />
      ) : null}

      {section === "admissions" ? (
        <div className="space-y-4">
          <DataTable
            columns={[
              { key: "course", label: "Course" },
              { key: "admissions", label: "Admissions" },
              { key: "revenue", label: "Revenue" },
              { key: "pending", label: "Pending Fees" },
              { key: "cancelled", label: "Cancelled" },
              { key: "refund", label: "Refund" },
            ]}
            rows={(((data?.byCourse || []) as Record<string, unknown>[]) ?? []).map((r) => ({
              ...r,
              revenue: formatInr(Number(r.revenue || 0)),
              pending: formatInr(Number(r.pending || 0)),
              refund: formatInr(Number(r.refund || 0)),
            }))}
          />
        </div>
      ) : null}

      {section === "revenue" ? (
        <DataTable
          columns={[
            { key: "employee", label: "Employee" },
            { key: "admissions", label: "Admissions" },
            { key: "revenue", label: "Revenue" },
            { key: "pendingFees", label: "Pending Fees" },
            { key: "avgRevenuePerAdmission", label: "Avg / Admission" },
          ]}
          rows={(((data?.byEmployee || []) as Record<string, unknown>[]) ?? []).map((r) => ({
            ...r,
            revenue: formatInr(Number(r.revenue || 0)),
            pendingFees: formatInr(Number(r.pendingFees || 0)),
            avgRevenuePerAdmission: formatInr(Number(r.avgRevenuePerAdmission || 0)),
          }))}
        />
      ) : null}

      {section === "timeline" ? (
        <div className="space-y-3">
          {!filters.employeeId ? (
            <EmptyState text="Select an employee in the filters to open their chronological timeline." />
          ) : (
            <>
              <h3 className="text-sm font-semibold text-[#0f172a]">
                Timeline — {(data?.employeeName as string) || "Employee"}
              </h3>
              <ol className="space-y-3 border-l-2 border-[#e8dcc8] pl-4">
                {(((data?.events || []) as { at: string; kind: string; title: string; detail?: string }[]) ?? []).map(
                  (ev, i) => (
                    <li key={`${ev.at}-${i}`} className="relative">
                      <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[#c9a227]" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
                        {ev.at ? new Date(ev.at).toLocaleString("en-IN") : "-"} · {ev.kind}
                      </p>
                      <p className="text-sm font-medium text-[#0f172a]">{ev.title}</p>
                      {ev.detail ? <p className="text-xs text-[#64748b]">{ev.detail}</p> : null}
                    </li>
                  ),
                )}
              </ol>
              {!((data?.events as unknown[]) || []).length ? (
                <EmptyState text="No timeline events in this date range." />
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {section === "eod" ? (
        <div className="space-y-4">
          {(data?.warning as string) ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {String(data?.warning)}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard title="EOD submitted" value={((data?.rows as unknown[]) || []).length} loading={loading} />
            <StatCard
              title="Missing submissions (weekdays)"
              value={((data?.missingEmployees as unknown[]) || []).length}
              loading={loading}
            />
          </div>
          <DataTable
            columns={[
              { key: "employeeName", label: "Employee" },
              { key: "summary_date", label: "Date" },
              { key: "completed_work", label: "Achievement" },
              { key: "challenges", label: "Challenges" },
              { key: "pending_work", label: "Pending" },
              { key: "tomorrow_plan", label: "Tomorrow" },
              { key: "support_required", label: "Support" },
              { key: "additional_remarks", label: "Remarks" },
              { key: "manager_remarks", label: "Manager Remarks" },
              { key: "status", label: "Status" },
            ]}
            rows={((data?.rows || []) as Record<string, unknown>[]) ?? []}
          />
          {((data?.missingEmployees as unknown[]) || []).length ? (
            <>
              <h3 className="text-sm font-semibold text-[#0f172a]">Employees who did not submit EOD</h3>
              <DataTable
                columns={[
                  { key: "employeeName", label: "Employee" },
                  { key: "date", label: "Date" },
                ]}
                rows={((data?.missingEmployees || []) as Record<string, unknown>[]) ?? []}
              />
            </>
          ) : null}
          {!isEmployee ? <EodReviewHint /> : null}
        </div>
      ) : null}

      {section === "download" ? (
        <div className="space-y-4">
          <p className="text-sm text-[#64748b]">
            Export current filters as multi-sheet Excel (Daily scorecards, Calls, Tasks, EOD) or use CSV / PDF / Print
            on any section. Exports include the active date range and filters.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-10 rounded-full bg-[#c9a227] px-5 text-sm text-white hover:bg-[#b8921f]"
              disabled={!!exportBusy}
              onClick={() => void exportCurrent("xlsx")}
            >
              Download Excel pack
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full border-[#e8dcc8] px-5 text-sm"
              onClick={() => void exportCurrent("csv")}
            >
              CSV (current section data)
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full border-[#e8dcc8] px-5 text-sm"
              onClick={() => void exportCurrent("pdf")}
            >
              PDF
            </Button>
          </div>
          <p className="text-xs text-[#94a3b8]">
            Branding: AJ OS · Generated {new Date().toLocaleString("en-IN")} · Filters {filters.from} → {filters.to}
            {filters.employeeId ? ` · Employee scoped` : " · Company / team"}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-[#0f172a]">{title}</h3>
      {children}
    </div>
  );
}

function FunnelBars({ funnel }: { funnel: Record<string, number> }) {
  const steps = [
    { key: "generated", label: "Generated" },
    { key: "contacted", label: "Contacted" },
    { key: "interested", label: "Interested" },
    { key: "admission", label: "Admission" },
  ];
  const max = Math.max(1, ...steps.map((s) => funnel[s.key] || 0));
  return (
    <div className="space-y-3 py-2">
      {steps.map((s) => {
        const v = funnel[s.key] || 0;
        const pct = Math.round((v / max) * 100);
        return (
          <div key={s.key} className="space-y-1">
            <div className="flex justify-between text-xs text-[#475569]">
              <span>{s.label}</span>
              <span>{v}</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100">
              <div className="h-2.5 rounded-full bg-[#1e3a5f]" style={{ width: `${Math.max(4, pct)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HighlightCard({
  label,
  person,
  metric,
}: {
  label: string;
  person: Record<string, unknown> | null | undefined;
  metric?: string;
}) {
  if (!person) {
    return (
      <div className="rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-4 text-sm text-[#64748b]">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">{label}</p>
        <p className="mt-2">No data</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#0f172a]">{String(person.employeeName || "-")}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#64748b]">
        <BandBadge band={String(person.productivityBand || "yellow")} score={Number(person.productivityScore || 0)} />
        {metric ? (
          <span>
            {metric}:{" "}
            {metric === "revenue" ? formatInr(Number(person[metric] || 0)) : String(person[metric] ?? "-")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function EodReviewHint() {
  return (
    <p className="text-xs text-[#64748b]">
      Admins can review and add manager remarks from Attendance → Work Summaries. Run{" "}
      <code className="rounded bg-[#f1f5f9] px-1">AJ_Academy_SB/analytics_reporting_schema.sql</code> for extended EOD
      fields (support required, additional remarks, review audit).
    </p>
  );
}
