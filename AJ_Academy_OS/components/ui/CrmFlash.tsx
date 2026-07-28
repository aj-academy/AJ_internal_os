"use client";

import { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const TONE = {
  success: {
    title: "Success",
    iconWrap: "bg-[#f0faf4] text-[#1f6b45] border-[#c9e8d4]",
    Icon: CheckCircle2,
  },
  error: {
    title: "Error",
    iconWrap: "bg-[#fff5f5] text-[#9b2c2c] border-[#f0c7c7]",
    Icon: AlertCircle,
  },
  info: {
    title: "Notice",
    iconWrap: "bg-[#fffdf8] text-[#3d3428] border-[#e8dcc8]",
    Icon: Info,
  },
} as const;

export type CrmFlashTone = keyof typeof TONE;

type Props = {
  message: string | null | undefined;
  tone?: CrmFlashTone;
  /** Auto-hide after this many ms. Default 0 (stay until closed). Pass >0 to auto-dismiss. */
  durationMs?: number;
  onDismiss?: () => void;
  className?: string;
};

/**
 * CRM-themed centered status popup for success / error / info messages.
 * Matches College Visits gold/cream theme and includes an explicit close control.
 */
export function CrmFlash({
  message,
  tone = "success",
  durationMs = 0,
  onDismiss,
  className = "",
}: Props) {
  useEffect(() => {
    if (!message || !onDismiss || durationMs <= 0) return;
    const id = window.setTimeout(() => onDismiss(), durationMs);
    return () => window.clearTimeout(id);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  const meta = TONE[tone];
  const Icon = meta.Icon;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 p-4" role="alertdialog" aria-modal="true">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 cursor-default"
        onClick={() => onDismiss?.()}
      />
      <div
        className={[
          "relative w-full max-w-md overflow-hidden rounded-2xl border border-[#e8dcc8] bg-white shadow-[0_24px_60px_rgba(61,52,40,0.22)]",
          className,
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e8dcc8] bg-[#fffdf8] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${meta.iconWrap}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#a68b2e]">{meta.title}</p>
              <h3 className="text-base font-semibold text-[#3d3428]">AJ Academy</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDismiss?.()}
            className="rounded-full p-1.5 hover:bg-[#faf3e3]"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-[#8a7a65]" />
          </button>
        </div>

        <div className="px-5 py-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#5c4f3d]">{message}</p>
        </div>

        <div className="flex justify-end border-t border-[#e8dcc8] bg-[#fffdf8] px-5 py-3">
          <Button
            type="button"
            className="rounded-full bg-[#c9a227] px-5 text-white hover:bg-[#b8921f]"
            onClick={() => onDismiss?.()}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
