"use client";

import { ChevronDown } from "lucide-react";

export type TableHeaderFilterOption = {
  value: string;
  label: string;
};

type TableHeaderFilterProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: TableHeaderFilterOption[];
  allLabel?: string;
  disabled?: boolean;
  className?: string;
  type?: "select" | "date";
};

export function TableHeaderFilter({
  label,
  value,
  onChange,
  options = [],
  allLabel = "All",
  disabled = false,
  className = "",
  type = "select",
}: TableHeaderFilterProps) {
  return (
    <th className={["px-3 py-2 text-left align-top", className].join(" ")}>
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">{label}</span>
        {type === "date" ? (
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-label={`Filter by ${label}`}
            className="h-8 w-full min-w-[8.5rem] rounded-lg border border-[#cfdceb] bg-white px-2 text-xs font-medium normal-case text-[#334155] outline-none focus:border-[#2563eb] disabled:opacity-50"
          />
        ) : (
          <span className="relative flex items-center">
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              aria-label={`Filter by ${label}`}
              className="h-8 w-full min-w-[7rem] appearance-none rounded-lg border border-[#cfdceb] bg-white py-1 pl-2 pr-7 text-xs font-medium normal-case text-[#334155] outline-none focus:border-[#2563eb] disabled:opacity-50"
            >
              <option value="">{allLabel}</option>
              {options.map((opt) => (
                <option key={opt.value || opt.label} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-[#64748b]" />
          </span>
        )}
      </label>
    </th>
  );
}

export function TableHeaderCell({ label, className = "" }: { label: string; className?: string }) {
  return (
    <th className={["px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#64748b]", className].join(" ")}>
      {label}
    </th>
  );
}
