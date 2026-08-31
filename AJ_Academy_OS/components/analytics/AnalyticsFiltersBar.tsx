"use client";

import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";
import {
  ANALYTICS_SECTION_LABELS,
  type AnalyticsFilters,
  type AnalyticsSectionId,
} from "@/lib/analytics/types";

type EmployeeOpt = { id: string; label: string; department?: string | null; role?: string | null };

const FIELD_CLASS =
  "h-9 w-full rounded-lg border border-[#dbe6f3] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#c4a35a]";

const LABEL_CLASS = "block text-xs font-semibold text-[#64748b]";

export function AnalyticsFiltersBar({
  section,
  sections,
  onSectionChange,
  filters,
  onChange,
  searchDraft,
  onSearchDraftChange,
  employees,
  departments,
  roles,
  lockEmployee,
  loading,
}: {
  section: AnalyticsSectionId;
  sections: AnalyticsSectionId[];
  onSectionChange: (next: AnalyticsSectionId) => void;
  filters: AnalyticsFilters;
  onChange: (next: AnalyticsFilters) => void;
  /** Uncontrolled-by-network search text; the parent debounces it into `filters.search`. */
  searchDraft: string;
  onSearchDraftChange: (next: string) => void;
  employees: EmployeeOpt[];
  departments: string[];
  roles: string[];
  lockEmployee?: boolean;
  loading?: boolean;
}) {
  const toOpts = (items: string[]) => items.filter(Boolean).map((v) => ({ value: v, label: v }));

  // Keep the range valid without silently discarding what the user just typed.
  const setStart = (from: string) => {
    onChange({ ...filters, from, to: from && filters.to && from > filters.to ? from : filters.to, page: 1 });
  };
  const setEnd = (to: string) => {
    onChange({ ...filters, to, from: to && filters.from && to < filters.from ? to : filters.from, page: 1 });
  };

  return (
    <div className="space-y-3 rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">Filters</p>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#64748b]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Updating report…
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <label className={`${LABEL_CLASS} space-y-1`}>
          Report Type
          <select
            className={FIELD_CLASS}
            value={section}
            onChange={(e) => onSectionChange(e.target.value as AnalyticsSectionId)}
          >
            {sections.map((id) => (
              <option key={id} value={id}>
                {ANALYTICS_SECTION_LABELS[id]}
              </option>
            ))}
          </select>
        </label>

        <label className={`${LABEL_CLASS} space-y-1`}>
          Start Date
          <Input type="date" className={FIELD_CLASS} value={filters.from} max={filters.to || undefined} onChange={(e) => setStart(e.target.value)} />
        </label>

        <label className={`${LABEL_CLASS} space-y-1`}>
          End Date
          <Input type="date" className={FIELD_CLASS} value={filters.to} min={filters.from || undefined} onChange={(e) => setEnd(e.target.value)} />
        </label>

        <MultiSelectFilter
          label="Employee"
          values={filters.employeeIds}
          onChange={(employeeIds) => onChange({ ...filters, employeeIds, page: 1 })}
          options={employees.map((e) => ({ value: e.id, label: e.label }))}
          allLabel="All employees"
          disabled={lockEmployee}
          searchable
        />

        <MultiSelectFilter
          label="Department"
          values={filters.departments}
          onChange={(departments) => onChange({ ...filters, departments, page: 1 })}
          options={toOpts(departments)}
          allLabel="All departments"
          disabled={lockEmployee}
        />

        <MultiSelectFilter
          label="Role"
          values={filters.roles}
          onChange={(roles) => onChange({ ...filters, roles, page: 1 })}
          options={toOpts(roles)}
          allLabel="All roles"
          disabled={lockEmployee}
        />
      </div>

      <label className={`${LABEL_CLASS} space-y-1`}>
        Search
        <Input
          className={FIELD_CLASS}
          placeholder={`Search across ${ANALYTICS_SECTION_LABELS[section]}…`}
          value={searchDraft}
          onChange={(e) => onSearchDraftChange(e.target.value)}
        />
      </label>
    </div>
  );
}
