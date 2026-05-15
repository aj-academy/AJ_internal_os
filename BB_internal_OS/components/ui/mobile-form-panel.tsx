"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileFormPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  /** Wider panel on desktop only */
  wide?: boolean;
}

/**
 * Full-viewport form on phone & tablet; compact side panel from lg (laptop) up.
 */
export function MobileFormPanel({
  open,
  onClose,
  title,
  children,
  className,
  wide = false,
}: MobileFormPanelProps) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close overlay"
        className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-form-panel-title"
        className={cn(
          "mobile-form-panel fixed z-[61] flex flex-col bg-white",
          wide ? "lg:max-w-2xl" : "lg:max-w-lg",
          className,
        )}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e8edf5] px-4 py-4 sm:px-5">
          <h2 id="mobile-form-panel-title" className="min-w-0 text-lg font-semibold text-[#0f172a] sm:text-xl">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mobile-panel-close touch-target shrink-0 rounded-full border border-[#d4deea] bg-white p-2 text-[#1e3a8a] shadow-sm transition hover:bg-[#eff6ff] active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          {children}
        </div>
      </div>
    </>
  );
}
