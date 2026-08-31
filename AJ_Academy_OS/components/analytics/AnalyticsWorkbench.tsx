"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { TablePagination } from "@/components/ui/TablePagination";
import { AnalyticsFiltersBar } from "@/components/analytics/AnalyticsFiltersBar";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import {
  ANALYTICS_SECTION_LABELS,
  ANALYTICS_SECTION_ORDER,
  ANALYTICS_SECTION_SLUGS,
  EMPTY_ANALYTICS_FILTERS,
  parseSectionParam,
  REPORT_SECONDARY_FILTERS,
  type AnalyticsFilters,
  type AnalyticsSectionId,
} from "@/lib/analytics/types";
import { toDateKeyIst } from "@/lib/analytics/dateRanges";
import { PRODUCTIVITY_PART_LABELS, PRODUCTIVITY_PART_MAX } from "@/lib/analytics/productivity";
import { formatInr } from "@/components/reports/reportsHelpers";
import { usePagination } from "@/lib/usePagination";
import {
  exportMultiSheetExcel,
  exportRowsAsCsv,
  exportRowsAsExcel,
  exportRowsAsPdf,
  formatCallActivityExportRows,
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

function formatIstTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type DataColumn = {
  key: string;
  label: string;
  wrap?: boolean;
  render?: (row: Record<string, unknown>) => React.ReactNode;
};

function DataTable({
  columns,
  rows,
  initialPageSize = 25,
}: {
  columns: DataColumn[];
  rows: Record<string, unknown>[];
  initialPageSize?: number;
}) {
  const {
    paginatedItems,
    page,
    setPage,
    totalPages,
    totalItems,
    pageSize,
    setPageSize,
  } = usePagination(rows, initialPageSize);

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
            {paginatedItems.map((row, idx) => (
              <tr key={`${page}-${idx}`} className="hover:bg-[#fafcff]">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={
                      c.wrap
                        ? "max-w-[320px] whitespace-normal break-words px-3 py-2 text-[#334155]"
                        : "whitespace-nowrap px-3 py-2 text-[#334155]"
                    }
                  >
                    {c.render
                      ? c.render(row)
                      : row[c.key] == null || row[c.key] === ""
                        ? "-"
                        : String(row[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={page}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50, 100]}
        alwaysShow
      />
    </div>
  );
}

type ProductivityBreakdown = {
  employeeName: string;
  score: number;
  band: string;
  parts: Record<string, number>;
};

/** Part 14: a score is never shown without the components that produced it. */
function ProductivityBreakdownModal({
  detail,
  onClose,
}: {
  detail: ProductivityBreakdown;
  onClose: () => void;
}) {
  const keys = Object.keys(PRODUCTIVITY_PART_MAX) as (keyof typeof PRODUCTIVITY_PART_MAX)[];
  const earned = keys.reduce((s, k) => s + Number(detail.parts?.[k] ?? 0), 0);
  const total = keys.reduce((s, k) => s + PRODUCTIVITY_PART_MAX[k], 0);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#eef2f7] px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">Productivity breakdown</p>
            <h3 className="mt-0.5 text-lg font-semibold text-[#0f172a]">{detail.employeeName}</h3>
          </div>
          <BandBadge band={detail.band} score={detail.score} />
        </div>

        <ul className="divide-y divide-[#f1f5f9] px-5">
          {keys.map((k) => {
            const got = Number(detail.parts?.[k] ?? 0);
            const max = PRODUCTIVITY_PART_MAX[k];
            return (
              <li key={k} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-[#334155]">{PRODUCTIVITY_PART_LABELS[k]}</span>
                  <span className="font-semibold text-[#0f172a]">
                    {got}/{max}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-[#f1f5f9]">
                  <div
                    className="h-1.5 rounded-full bg-[#c9a227]"
                    style={{ width: `${Math.min(100, Math.round((got / max) * 100))}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between gap-3 border-t border-[#eef2f7] px-5 py-3">
          <p className="text-sm font-semibold text-[#0f172a]">
            Total: {earned}/{total}
          </p>
          <Button type="button" variant="outline" className="h-8 rounded-full px-4 text-xs" onClick={onClose}>
            Close
          </Button>
        </div>

        <p className="border-t border-[#eef2f7] bg-[#f8fbff] px-5 py-3 text-[11px] leading-relaxed text-[#64748b]">
          Components are weighted for sales activity, so roles that do not make calls or admissions cannot reach the
          full 100. A role-aware formula is proposed but not yet applied.
        </p>
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sections = useMemo(
    () => ANALYTICS_SECTION_ORDER.filter((id) => !isEmployee || id !== "team"),
    [isEmployee],
  );

  // The URL is the source of truth for the selected report, so reports stay
  // linkable and browser back/forward works without mirroring state.
  const urlSection = parseSectionParam(searchParams.get("report"));
  const section = urlSection && sections.includes(urlSection) ? urlSection : "overview";

  const setSection = useCallback(
    (next: AnalyticsSectionId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("report", ANALYTICS_SECTION_SLUGS[next]);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const [filters, setFilters] = useState<AnalyticsFilters>(() => {
    const today = toDateKeyIst();
    return { ...EMPTY_ANALYTICS_FILTERS, from: today, to: today };
  });
  const [searchDraft, setSearchDraft] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [scoreDetail, setScoreDetail] = useState<ProductivityBreakdown | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [filterOpts, setFilterOpts] = useState<{
    employees: { id: string; label: string; department?: string | null; role?: string | null }[];
    departments: string[];
    roles: string[];
    courses: string[];
    leadSources: string[];
    leadStatuses: string[];
    admissionStatuses: string[];
  }>({
    employees: [],
    departments: [],
    roles: [],
    courses: [],
    leadSources: [],
    leadStatuses: [],
    admissionStatuses: [],
  });

  const load = useCallback(async () => {
    // A newer filter change supersedes any request still in flight.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      // Only the active report's secondary filter is sent, so a selection left
      // behind in another report cannot silently narrow this one.
      const secondaryKey = REPORT_SECONDARY_FILTERS[section];
      const secondary: Record<string, string[]> = {};
      if (secondaryKey) {
        const values = filters[secondaryKey];
        if (Array.isArray(values) && values.length) secondary[secondaryKey] = values;
      }

      const res = await fetch("/api/analytics/query", {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section,
          from: filters.from,
          to: filters.to,
          employeeIds: filters.employeeIds.length ? filters.employeeIds : undefined,
          departments: filters.departments.length ? filters.departments : undefined,
          roles: filters.roles.length ? filters.roles : undefined,
          ...secondary,
          search: filters.search || undefined,
          page: filters.page,
          pageSize: filters.pageSize,
        }),
      });
      const json = (await res.json()) as Record<string, unknown> & { error?: string; viewer?: Viewer; filterOptions?: typeof filterOpts };
      if (res.status === 401 || res.status === 403) {
        setDenied(
          json.error === "Forbidden"
            ? "Your role does not have access to Reports & Analytics."
            : json.error || "Your session is no longer valid. Sign in again to view reports.",
        );
        setData(null);
        return;
      }
      if (res.status === 429) {
        setError("Too many report requests in a short time. Wait a moment and try again.");
        return;
      }
      if (!res.ok) throw new Error(json.error || "Failed to load report.");
      setDenied(null);
      setData(json);
      if (json.viewer) setViewer(json.viewer);
      if (json.filterOptions) {
        const fo = json.filterOptions as Partial<typeof filterOpts>;
        setFilterOpts({
          employees: fo.employees ?? [],
          departments: fo.departments ?? [],
          roles: fo.roles ?? [],
          courses: fo.courses ?? [],
          leadSources: fo.leadSources ?? [],
          leadStatuses: fo.leadStatuses ?? [],
          admissionStatuses: fo.admissionStatuses ?? [],
        });
      }
      if (isEmployee && json.viewer?.id) {
        setFilters((prev) =>
          prev.employeeIds.length === 1 && prev.employeeIds[0] === json.viewer!.id
            ? prev
            : { ...prev, employeeIds: [json.viewer!.id] },
        );
      }
    } catch (e) {
      // The superseding request owns the loading state and the next result.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load analytics.");
      setData(null);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [filters, isEmployee, section]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Search is debounced so typing does not fire a query per keystroke.
  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.search === searchDraft ? prev : { ...prev, search: searchDraft, page: 1 }));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search]);

  const kpis = (data?.kpis || {}) as Record<string, number>;
  const charts = (data?.charts || {}) as Record<string, unknown>;
  const employees = (data?.employees || []) as Record<string, unknown>[];
  const team = (data?.team || {}) as Record<string, unknown>;
  const accountability = (data?.accountability || []) as { employeeName: string; issues: string[]; productivityScore: number }[];

  const partialWarning = useMemo(() => {
    const partial = data?.partial as { tables?: string[] } | undefined;
    if (!partial?.tables?.length) return null;
    return `Showing partial data — ${partial.tables.join(", ")} reached the row limit for this date range, so totals may be understated. Narrow the date range, employee, or department for exact figures.`;
  }, [data]);

  const revenueTotals = useMemo(() => {
    const rows = ((data?.byEmployee || []) as Record<string, unknown>[]) ?? [];
    const totals = { revenue: 0, pendingFees: 0, admissions: 0 };
    for (const r of rows) {
      totals.revenue += Number(r.revenue || 0);
      totals.pendingFees += Number(r.pendingFees || 0);
      totals.admissions += Number(r.admissions || 0);
    }
    return totals;
  }, [data]);

  const secondaryFilter = useMemo(() => {
    const key = REPORT_SECONDARY_FILTERS[section];
    if (!key) return null;
    const values = (filters[key] as string[]) ?? [];
    const onChange = (next: string[]) => setFilters((prev) => ({ ...prev, [key]: next, page: 1 }));
    const toOpts = (items: string[]) => items.filter(Boolean).map((v) => ({ value: v, label: v }));

    if (key === "leadStatuses") {
      return { label: "Lead status", values, onChange, options: toOpts(filterOpts.leadStatuses), allLabel: "All lead statuses" };
    }
    if (key === "admissionStatuses") {
      return {
        label: "Admission status",
        values,
        onChange,
        options: toOpts(filterOpts.admissionStatuses),
        allLabel: "All admission statuses",
      };
    }
    return {
      label: "Task status",
      values,
      onChange,
      options: toOpts(["Pending", "In Progress", "Completed"]),
      allLabel: "All task statuses",
    };
  }, [filterOpts.admissionStatuses, filterOpts.leadStatuses, filters, section]);

  const exportCurrent = async (fmt: "csv" | "xlsx" | "pdf") => {
    setExportBusy(fmt);
    try {
      // Single day exports read as one date, ranges as from_to_to.
      const stamp = filters.from === filters.to ? filters.from : `${filters.from}_to_${filters.to}`;
      const slug = ANALYTICS_SECTION_LABELS[section].replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const base = `AJ_OS_${slug}_${stamp}`;
      let rows: ExportRow[] = [];
      const title = ANALYTICS_SECTION_LABELS[section];

      if (section === "calls") {
        rows = formatCallActivityExportRows(((data?.allRows || data?.rows || []) as ExportRow[]) ?? []);
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
        const callRows = formatCallActivityExportRows(
          ((data?.calls as { allRows?: ExportRow[] })?.allRows || []) as ExportRow[],
        );
        const taskRows = ((data?.tasks as { rows?: ExportRow[] })?.rows || []) as ExportRow[];
        const eodRows = ((data?.eod as { rows?: ExportRow[] })?.rows || []) as ExportRow[];
        await exportMultiSheetExcel(`AJ_OS_Analytics_Pack_${stamp}.xlsx`, [
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

      if (fmt === "csv") exportRowsAsCsv(`${base}.csv`, rows);
      else if (fmt === "xlsx") await exportRowsAsExcel(`${base}.xlsx`, [...metaPrefix, ...rows]);
      else {
        await exportRowsAsPdf(`AJ OS — ${title}`, `${base}.pdf`, rows, {
          generatedAt: new Date().toLocaleString("en-IN"),
          dateRange: `${filters.from} → ${filters.to}`,
          summary: `${rows.length} row(s)`,
        });
      }
    } finally {
      setExportBusy(null);
    }
  };

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

      <AnalyticsFiltersBar
        section={section}
        sections={sections}
        onSectionChange={setSection}
        filters={filters}
        onChange={setFilters}
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        employees={filterOpts.employees}
        departments={filterOpts.departments}
        roles={filterOpts.roles}
        lockEmployee={isEmployee}
        loading={loading}
      />

      {secondaryFilter ? (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#e8dcc8] bg-[#fffdf8] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">
            {ANALYTICS_SECTION_LABELS[section]} filter
          </p>
          <div className="min-w-[220px]">
            <MultiSelectFilter
              label={secondaryFilter.label}
              values={secondaryFilter.values}
              onChange={secondaryFilter.onChange}
              options={secondaryFilter.options}
              allLabel={secondaryFilter.allLabel}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {partialWarning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {partialWarning}
        </div>
      ) : null}

      {denied ? (
        <div className="rounded-2xl border border-[#dbe6f3] bg-[#fafcff] px-4 py-10 text-center">
          <p className="text-sm font-semibold text-[#0f172a]">Access denied</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-[#64748b]">{denied}</p>
        </div>
      ) : null}

      {!denied && section === "overview" ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Present"
              value={kpis.employeesPresent ?? 0}
              loading={loading}
              subtitle={`of ${kpis.totalEmployees ?? 0} staff, checked in this range`}
            />
            <StatCard
              title="Total Calls"
              value={kpis.totalCalls ?? 0}
              loading={loading}
              subtitle={`${kpis.connectedCalls ?? 0} connected${
                kpis.totalCalls ? ` · ${Math.round(((kpis.connectedCalls ?? 0) / kpis.totalCalls) * 100)}%` : ""
              }`}
            />
            <StatCard title="Pending Follow-ups" value={kpis.pendingFollowups ?? 0} loading={loading} />
            <StatCard
              title="Tasks Completed"
              value={kpis.tasksCompleted ?? 0}
              loading={loading}
              subtitle="Finished in this date range"
            />
            <StatCard title="Tasks Overdue" value={kpis.tasksOverdue ?? 0} loading={loading} subtitle="Past due, still open" />
            <StatCard
              title="Admissions"
              value={kpis.admissions ?? 0}
              loading={loading}
              subtitle="Admitted / updated in this date range"
            />
            <StatCard title="Revenue" value={formatInr(kpis.revenueGenerated ?? 0)} loading={loading} />
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

      {!denied && section === "daily" || section === "productivity" ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#0f172a]">
            {section === "daily" ? "Daily employee scorecard" : "Productivity ranking"}
          </h3>
          <p className="text-xs text-[#64748b]">
            Tasks Done is work finished in the selected dates (IST), not every task that happens to be due.
            Completed work shows the task titles. Check-in times are India time. Click a productivity score to see how
            it was calculated.
          </p>
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
              { key: "completedWork", label: "Completed work", wrap: true },
              { key: "tasksPending", label: "Still Open" },
              { key: "overdueTasks", label: "Overdue" },
              { key: "crmUpdates", label: "CRM Updates" },
              { key: "followupsPending", label: "FU Pending" },
              {
                key: "scoreLabel",
                label: "Productivity",
                render: (row) => (
                  <button
                    type="button"
                    className="rounded-full underline decoration-dotted underline-offset-2 hover:text-[#0f172a]"
                    title="Show score breakdown"
                    onClick={() =>
                      setScoreDetail({
                        employeeName: String(row.employeeName || "Employee"),
                        score: Number(row.productivityScore || 0),
                        band: String(row.productivityBand || "yellow"),
                        parts: (row.productivityParts as Record<string, number>) || {},
                      })
                    }
                  >
                    {String(row.scoreLabel ?? "-")}
                  </button>
                ),
              },
            ]}
            rows={employees.map((e) => ({
              ...e,
              checkIn: formatIstTime(e.checkIn ? String(e.checkIn) : null),
              checkOut: formatIstTime(e.checkOut ? String(e.checkOut) : null),
              revenue: formatInr(Number(e.revenue || 0)),
              scoreLabel: `${e.productivityScore}% (${e.productivityBand})`,
            }))}
          />
        </div>
      ) : null}

      {!denied && section === "team" ? (
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

      {!denied && section === "calls" ? (
        <div className="space-y-3">
          <p className="text-xs text-[#64748b]">
            Includes Student Lead call sessions and College Visits dialer Phone Call logs. Widen Start / End Date for
            older activity, then page through the table below.
          </p>
          <DataTable
            key={`calls-${filters.from}-${filters.to}-${filters.employeeIds.join(",")}-${filters.search}`}
            initialPageSize={25}
            columns={[
              { key: "employee", label: "Employee" },
              { key: "source", label: "Source" },
              { key: "leadName", label: "Lead / College" },
              { key: "mobile", label: "Mobile" },
              { key: "date", label: "Date" },
              { key: "time", label: "Time" },
              { key: "outcome", label: "Outcome" },
              { key: "remarks", label: "Remarks" },
              { key: "nextFollowUp", label: "Next Follow-up" },
              { key: "status", label: "Status" },
            ]}
            rows={((data?.rows || []) as Record<string, unknown>[]) ?? []}
          />
        </div>
      ) : null}

      {!denied && section === "followups" ? (
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

      {!denied && section === "tasks" ? (
        <div className="space-y-4">
          <p className="text-xs text-[#64748b]">
            Completed rows are tasks actually finished in this date range (India time), with the completion note the
            person typed. Open / overdue tasks appear in the same table with status Pending or In Progress. Use the
            Task status filter above if you only want finished work.
          </p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard title="Total" value={Number(data?.total || 0)} loading={loading} />
            <StatCard title="Completed" value={Number(data?.completed || 0)} loading={loading} subtitle="Finished in this date range" />
            <StatCard title="Pending" value={Number(data?.pending || 0)} loading={loading} subtitle="Still open, due in range" />
            <StatCard title="Overdue" value={Number(data?.overdue || 0)} loading={loading} />
            <StatCard
              title="Completion %"
              value={
                Number(data?.total || 0) > 0
                  ? `${Math.round((Number(data?.completed || 0) / Number(data?.total)) * 100)}%`
                  : "-"
              }
              loading={loading}
            />
          </div>
          <DataTable
            columns={[
              { key: "task", label: "Task", wrap: true },
              { key: "assignedBy", label: "Assigned By" },
              { key: "assignedTo", label: "Assigned To" },
              { key: "completedBy", label: "Completed By" },
              { key: "priority", label: "Priority" },
              { key: "deadline", label: "Deadline" },
              { key: "status", label: "Status" },
              { key: "progress", label: "%" },
              { key: "completionTime", label: "Completed At" },
              { key: "completionSummary", label: "What was completed", wrap: true },
            ]}
            rows={((data?.rows || []) as Record<string, unknown>[]) ?? []}
          />
        </div>
      ) : null}

      {!denied && section === "conversion" ? (
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

      {!denied && section === "admissions" ? (
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

      {!denied && section === "revenue" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Revenue" value={formatInr(revenueTotals.revenue)} loading={loading} />
            <StatCard title="Pending Fees" value={formatInr(revenueTotals.pendingFees)} loading={loading} />
            <StatCard title="Admissions" value={revenueTotals.admissions} loading={loading} />
            <StatCard
              title="Avg / Admission"
              value={
                revenueTotals.admissions > 0
                  ? formatInr(Math.round(revenueTotals.revenue / revenueTotals.admissions))
                  : "-"
              }
              loading={loading}
            />
          </div>
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
        </div>
      ) : null}

      {!denied && section === "timeline" ? (
        <div className="space-y-3">
          <p className="text-xs text-[#64748b]">
            {filters.employeeIds.length === 1
              ? "Chronological log for the selected person: attendance, calls, CRM, college, tasks, follow-ups, and EOD."
              : "Team activity for the selected dates. Pick one employee to see only that person, or several to narrow the team feed."}
          </p>
          <h3 className="text-sm font-semibold text-[#0f172a]">
            Timeline — {(data?.employeeName as string) || (filters.employeeIds.length === 1 ? "Employee" : "Team")}
          </h3>
          <ol className="space-y-3 border-l-2 border-[#e8dcc8] pl-4">
            {(((data?.events || []) as { at: string; kind: string; title: string; detail?: string }[]) ?? []).map(
              (ev, i) => (
                <li key={`${ev.at}-${i}`} className="relative">
                  <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[#c9a227]" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">
                    {ev.at ? new Date(ev.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "-"} · {ev.kind}
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
        </div>
      ) : null}

      {!denied && section === "eod" ? (
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

      {!denied && section === "download" ? (
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
            {filters.employeeIds.length ? ` · Employee scoped` : " · Company / team"}
          </p>
        </div>
      ) : null}

      {scoreDetail ? (
        <ProductivityBreakdownModal detail={scoreDetail} onClose={() => setScoreDetail(null)} />
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
