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

const headerTypography = "text-xs font-semibold uppercase tracking-wide";
const headerBase = ["whitespace-nowrap", headerTypography].join(" ");
const headerPadDefault = "px-4 py-3";

function hasTextAlign(className: string) {
  return /\b!?text-(left|center|right)\b/.test(className);
}

function mergeHeaderClass(className: string, extra = "") {
  const hasPadX = /\bpx-\d/.test(className);
  const hasPadY = /\bpy-\d/.test(className);
  return [
    headerBase,
    hasPadX || hasPadY ? "" : headerPadDefault,
    hasPadX && !hasPadY ? "py-3" : "",
    !hasPadX && hasPadY ? "px-4" : "",
    hasTextAlign(className) ? "" : "text-left",
    extra,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

function headerTriggerClass(active: boolean, disabled: boolean, center = false) {
  return [
    "inline-flex items-center gap-1 border-0 bg-transparent p-0 outline-none transition-colors",
    center ? "mx-auto justify-center" : "",
    headerTypography,
    active ? "text-[#2563eb]" : "text-[#64748b]",
    disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:text-[#334155]",
  ]
    .filter(Boolean)
    .join(" ");
}

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
  const center = /\b!?text-center\b/.test(className);
  const thClass = mergeHeaderClass(className);

  if (type === "date") {
    return (
      <th className={thClass}>
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
          className={headerTriggerClass(active, disabled, center)}
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
    <th className={thClass}>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          aria-label={`Filter by ${label}`}
          className={headerTriggerClass(active, disabled, center)}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-80" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align={center ? "center" : "start"} className="max-h-64 min-w-[10rem] overflow-y-auto">
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
  const center = /\b!?text-center\b/.test(className);
  return (
    <th className={mergeHeaderClass(className, "text-[#64748b]")}>
      {center ? <span className="mx-auto block w-fit">{label}</span> : label}
    </th>
  );
}
