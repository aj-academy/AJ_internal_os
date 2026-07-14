"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type TableSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
  showClear?: boolean;
  hint?: string;
};

export function TableSearchBar({
  value,
  onChange,
  placeholder = "Search…",
  onClear,
  showClear = false,
  hint,
}: TableSearchBarProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full max-w-full md:max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 border-[#dbe6f3] bg-white pl-9"
        />
      </div>
      <div className="flex items-center gap-2">
        {hint ? <p className="text-xs text-[#64748b]">{hint}</p> : null}
        {showClear && onClear ? (
          <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg border-[#dbe6f3]" onClick={onClear}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
