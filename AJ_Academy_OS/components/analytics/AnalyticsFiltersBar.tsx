"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AnalyticsFilters, DatePreset } from "@/lib/analytics/types";
import { resolveDateRange } from "@/lib/analytics/dateRanges";

type EmployeeOpt = { id: string; label: string; department?: string | null; role?: string | null };

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This Week" },
  { id: "this_month", label: "This Month" },
  { id: "custom", label: "Custom" },
];

export function AnalyticsFiltersBar({
  filters,
  onChange,
  employees,
  departments,
  roles,
  lockEmployee,
  onRefresh,
  loading,
}: {
  filters: AnalyticsFilters;
  onChange: (next: AnalyticsFilters) => void;
  employees: EmployeeOpt[];
  departments: string[];
  roles: string[];
  lockEmployee?: boolean;
  onRefresh: () => void;
  loading?: boolean;
}) {
  const setPreset = (preset: DatePreset) => {
    const range = resolveDateRange(preset, filters.from, filters.to);
    onChange({ ...filters, preset, from: range.from, to: range.to });
  };

  const field =
    "h-9 rounded-lg border border-[#dbe6f3] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#c4a35a]";

  return (
    <div className="space-y-3 rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-4">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPreset(p.id)}
            className={
              filters.preset === p.id
                ? "rounded-full bg-[#c9a227] px-3 py-1.5 text-xs font-semibold text-white"
                : "rounded-full border border-[#e8dcc8] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b] hover:bg-white"
            }
          >
            {p.label}
          </button>
        ))}
        <Button
          type="button"
          size="sm"
          disabled={loading}
          className="ml-auto h-8 rounded-full bg-[#1e3a5f] px-4 text-xs text-white hover:bg-[#162d4a]"
          onClick={onRefresh}
        >
          {loading ? "Refreshing…" : "Apply / Refresh"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {filters.preset === "custom" ? (
          <>
            <label className="space-y-1 text-xs font-semibold text-[#64748b]">
              From
              <Input
                type="date"
                className={field}
                value={filters.from}
                onChange={(e) => onChange({ ...filters, from: e.target.value, preset: "custom" })}
              />
            </label>
            <label className="space-y-1 text-xs font-semibold text-[#64748b]">
              To
              <Input
                type="date"
                className={field}
                value={filters.to}
                onChange={(e) => onChange({ ...filters, to: e.target.value, preset: "custom" })}
              />
            </label>
          </>
        ) : null}

        <label className="space-y-1 text-xs font-semibold text-[#64748b]">
          Employee
          <select
            className={`${field} w-full`}
            disabled={lockEmployee}
            value={filters.employeeId}
            onChange={(e) => onChange({ ...filters, employeeId: e.target.value })}
          >
            {!lockEmployee ? <option value="">All employees</option> : null}
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs font-semibold text-[#64748b]">
          Department
          <select
            className={`${field} w-full`}
            value={filters.department}
            onChange={(e) => onChange({ ...filters, department: e.target.value })}
            disabled={lockEmployee}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs font-semibold text-[#64748b]">
          Role
          <select
            className={`${field} w-full`}
            value={filters.role}
            onChange={(e) => onChange({ ...filters, role: e.target.value })}
            disabled={lockEmployee}
          >
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs font-semibold text-[#64748b]">
          Course
          <Input
            className={field}
            placeholder="Program / course"
            value={filters.course}
            onChange={(e) => onChange({ ...filters, course: e.target.value })}
          />
        </label>

        <label className="space-y-1 text-xs font-semibold text-[#64748b]">
          Lead source
          <Input
            className={field}
            placeholder="Website, Facebook…"
            value={filters.leadSource}
            onChange={(e) => onChange({ ...filters, leadSource: e.target.value })}
          />
        </label>

        <label className="space-y-1 text-xs font-semibold text-[#64748b]">
          Lead status
          <Input
            className={field}
            placeholder="Interested, Admitted…"
            value={filters.leadStatus}
            onChange={(e) => onChange({ ...filters, leadStatus: e.target.value })}
          />
        </label>

        <label className="space-y-1 text-xs font-semibold text-[#64748b]">
          Task status
          <select
            className={`${field} w-full`}
            value={filters.taskStatus}
            onChange={(e) => onChange({ ...filters, taskStatus: e.target.value })}
          >
            <option value="">All</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>
        </label>

        <label className="space-y-1 text-xs font-semibold text-[#64748b]">
          Admission status
          <Input
            className={field}
            placeholder="Admitted, Cancelled…"
            value={filters.admissionStatus}
            onChange={(e) => onChange({ ...filters, admissionStatus: e.target.value })}
          />
        </label>

        <label className="space-y-1 text-xs font-semibold text-[#64748b] sm:col-span-2">
          Search
          <Input
            className={field}
            placeholder="Search across this report…"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
