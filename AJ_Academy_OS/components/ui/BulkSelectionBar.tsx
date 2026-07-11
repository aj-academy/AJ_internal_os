"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type BulkSelectionBarProps = {
  selectedCount: number;
  totalCount?: number;
  onClear?: () => void;
  children?: ReactNode;
  className?: string;
};

export function BulkSelectionBar({
  selectedCount,
  totalCount,
  onClear,
  children,
  className = "",
}: BulkSelectionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-[#c9d8ef] bg-[#f0f7ff] px-3 py-2 ${className}`}
    >
      <span className="text-xs font-semibold text-[#1e3a8a]">
        {selectedCount} selected{totalCount != null ? ` · ${totalCount} in view` : ""}
      </span>
      {children}
      {onClear ? (
        <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg px-2 text-xs" onClick={onClear}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}
