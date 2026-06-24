"use client";

import { useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

const headerBase =
  "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide";

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
  const active = Boolean(value);
  const dateInputRef = useRef<HTMLInputElement>(null);

  if (type === "date") {
    return (
      <th className={[headerBase, className].join(" ")}>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Filter by ${label}`}
          onClick={() => {
            const el = dateInputRef.current;
            if (!el) return;
            if (typeof el.showPicker === "function") el.showPicker();
            else el.click();
          }}
          className={[
            "inline-flex items-center gap-1 outline-none transition-colors",
            active ? "text-[#2563eb]" : "text-[#64748b]",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:text-[#334155]",
          ].join(" ")}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-80" />
        </button>
        <input
          ref={dateInputRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-hidden
          tabIndex={-1}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      </th>
    );
  }

  return (
    <th className={[headerBase, className].join(" ")}>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          aria-label={`Filter by ${label}`}
          className={[
            "inline-flex items-center gap-1 outline-none transition-colors",
            active ? "text-[#2563eb]" : "text-[#64748b]",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:text-[#334155]",
          ].join(" ")}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-80" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 min-w-[10rem] overflow-y-auto">
          <DropdownMenuItem onClick={() => onChange("")} className="justify-between">
            <span>{allLabel}</span>
            {!value ? <Check className="h-3.5 w-3.5 text-[#2563eb]" /> : null}
          </DropdownMenuItem>
          {options.map((opt) => (
            <DropdownMenuItem key={opt.value || opt.label} onClick={() => onChange(opt.value)} className="justify-between">
              <span>{opt.label}</span>
              {value === opt.value ? <Check className="h-3.5 w-3.5 text-[#2563eb]" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </th>
  );
}

export function TableHeaderCell({ label, className = "" }: { label: string; className?: string }) {
  return (
    <th className={[headerBase, "text-[#64748b]", className].join(" ")}>
      {label}
    </th>
  );
}
