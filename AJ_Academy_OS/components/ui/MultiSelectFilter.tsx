"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export type MultiSelectOption = { value: string; label: string };

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((v, i) => v === right[i]);
}

export function MultiSelectFilter({
  label,
  values,
  onChange,
  options,
  allLabel = "All",
  placeholder = "Select…",
  disabled = false,
  searchable = false,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  options: MultiSelectOption[];
  allLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(values);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(values);
      setQuery("");
    }
  }, [open, values]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const labelByValue = useMemo(
    () => Object.fromEntries(options.map((o) => [o.value, o.label])),
    [options],
  );

  const display = !values.length
    ? allLabel
    : values.length === 1
      ? labelByValue[values[0]] || values[0]
      : `${values.length} selected`;

  const commit = (next: string[]) => {
    if (!sameSet(next, values)) onChange(next);
  };

  const triggerClass = [
    "flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm outline-none",
    values.length ? "border-[#c4a35a] text-[#0f172a]" : "border-[#dbe6f3] text-[#334155]",
    disabled ? "cursor-not-allowed opacity-60" : "hover:border-[#c4a35a] focus:border-[#c4a35a]",
  ].join(" ");

  return (
    <label className="space-y-1 text-xs font-semibold text-[#64748b]">
      {label}
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          if (disabled) return;
          if (!next) commit(draft);
          setOpen(next);
        }}
      >
        <DropdownMenuTrigger disabled={disabled} className={triggerClass} aria-label={label}>
          <span className={`truncate ${values.length ? "" : "text-[#94a3b8]"}`}>
            {display || placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#94a3b8]" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[var(--anchor-width)] min-w-[16rem] p-1">
          {searchable ? (
            <div className="p-1" onPointerDown={(e) => e.stopPropagation()}>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="h-8 rounded-md border-[#dbe6f3] text-sm"
              />
            </div>
          ) : null}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setDraft([]);
            }}
            className="justify-between text-sm"
          >
            <span>{allLabel}</span>
            {!draft.length ? <Check className="h-3.5 w-3.5 text-[#2563eb]" /> : null}
          </DropdownMenuItem>
          {filtered.length > 1 ? (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setDraft(filtered.map((o) => o.value));
              }}
              className="text-sm text-[#64748b]"
            >
              Select visible ({filtered.length})
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((opt) => {
              const checked = draft.includes(opt.value);
              return (
                <DropdownMenuCheckboxItem
                  key={opt.value}
                  checked={checked}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => {
                    setDraft((prev) =>
                      prev.includes(opt.value)
                        ? prev.filter((v) => v !== opt.value)
                        : [...prev, opt.value],
                    );
                  }}
                  className="text-sm"
                >
                  {opt.label}
                </DropdownMenuCheckboxItem>
              );
            })}
            {!filtered.length ? (
              <p className="px-2 py-3 text-center text-xs text-[#94a3b8]">No matching options</p>
            ) : null}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </label>
  );
}
