"use client";

import { ChevronDown, Filter } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

type CollapsibleFilterPanelProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

/** Compact filters: collapsed on phone/tablet, expanded on laptop+. */
export function CollapsibleFilterPanel({
  title = "Search & filters",
  children,
  className = "",
}: CollapsibleFilterPanelProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      if (detailsRef.current) detailsRef.current.open = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <details
      ref={detailsRef}
      className={[
        "group rounded-xl border border-[#e2e8f0] bg-[#fafbfd] shadow-sm",
        className,
      ].join(" ")}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-[#475569] marker:content-none [&::-webkit-details-marker]:hidden lg:cursor-default lg:px-4 lg:py-3">
        <span className="flex items-center gap-2">
          <Filter className="h-4 w-4 shrink-0 text-[#2563eb]" aria-hidden />
          {title}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-[#94a3b8] transition group-open:rotate-180 lg:hidden"
          aria-hidden
        />
      </summary>
      <div className="border-t border-[#e8edf5] px-3 pb-3 pt-2 lg:px-4 lg:pb-4 lg:pt-3">{children}</div>
    </details>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium text-[#94a3b8]">{label}</span>
      {children}
    </label>
  );
}
