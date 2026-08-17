"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
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

const TASK_STATUS_OPTIONS = [
  { value: "Pending", label: "Pending" },
  { value: "In Progress", label: "In Progress" },
  { value: "Completed", label: "Completed" },
];

export function AnalyticsFiltersBar({
  filters,
  onChange,
  employees,
  departments,
  roles,
  courses,
  leadSources,
  leadStatuses,
  admissionStatuses,
  lockEmployee,
  onRefresh,
  loading,
}: {
  filters: AnalyticsFilters;
  onChange: (next: AnalyticsFilters) => void;
  employees: EmployeeOpt[];
  departments: string[];
  roles: string[];
  courses: string[];
  leadSources: string[];
  leadStatuses: string[];
  admissionStatuses: string[];
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

  const toOpts = (items: string[]) => items.filter(Boolean).map((v) => ({ value: v, label: v }));

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

        <MultiSelectFilter
          label="Employee"
          values={filters.employeeIds}
          onChange={(employeeIds) => onChange({ ...filters, employeeIds })}
          options={employees.map((e) => ({ value: e.id, label: e.label }))}
          allLabel="All employees"
          disabled={lockEmployee}
          searchable
        />

        <MultiSelectFilter
          label="Department"
          values={filters.departments}
          onChange={(departments) => onChange({ ...filters, departments })}
          options={toOpts(departments)}
          allLabel="All departments"
          disabled={lockEmployee}
        />

        <MultiSelectFilter
          label="Role"
          values={filters.roles}
          onChange={(roles) => onChange({ ...filters, roles })}
          options={toOpts(roles)}
          allLabel="All roles"
          disabled={lockEmployee}
        />

        <MultiSelectFilter
          label="Course"
          values={filters.courses}
          onChange={(courses) => onChange({ ...filters, courses })}
          options={toOpts(courses)}
          allLabel="All courses"
          searchable
        />

        <MultiSelectFilter
          label="Lead source"
          values={filters.leadSources}
          onChange={(leadSources) => onChange({ ...filters, leadSources })}
          options={toOpts(leadSources)}
          allLabel="All sources"
        />

        <MultiSelectFilter
          label="Lead status"
          values={filters.leadStatuses}
          onChange={(leadStatuses) => onChange({ ...filters, leadStatuses })}
          options={toOpts(leadStatuses)}
          allLabel="All statuses"
        />

        <MultiSelectFilter
          label="Task status"
          values={filters.taskStatuses}
          onChange={(taskStatuses) => onChange({ ...filters, taskStatuses })}
          options={TASK_STATUS_OPTIONS}
          allLabel="All"
        />

        <MultiSelectFilter
          label="Admission status"
          values={filters.admissionStatuses}
          onChange={(admissionStatuses) => onChange({ ...filters, admissionStatuses })}
          options={toOpts(admissionStatuses)}
          allLabel="All admission statuses"
        />

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
