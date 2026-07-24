"use client";

import { useEffect } from "react";

const TONE_CLASS = {
  success: "border-[#c9e8d4] bg-[#f0faf4] text-[#1f6b45] border-l-[3px] border-l-[#c9a227]",
  error: "border-[#f0c7c7] bg-[#fff5f5] text-[#9b2c2c] border-l-[3px] border-l-[#c9a227]/70",
  info: "border-[#e8dcc8] bg-[#fffdf8] text-[#3d3428] border-l-[3px] border-l-[#c9a227]",
} as const;

export type CrmFlashTone = keyof typeof TONE_CLASS;

type Props = {
  message: string | null | undefined;
  tone?: CrmFlashTone;
  /** Auto-hide after this many ms. Default 5000. Pass 0 to keep until cleared. */
  durationMs?: number;
  onDismiss?: () => void;
  className?: string;
};

/**
 * CRM-themed status banner. Success/error toasts auto-dismiss after 5 seconds by default.
 */
export function CrmFlash({
  message,
  tone = "success",
  durationMs = 5000,
  onDismiss,
  className = "",
}: Props) {
  useEffect(() => {
    if (!message || !onDismiss || durationMs <= 0) return;
    const id = window.setTimeout(() => onDismiss(), durationMs);
    return () => window.clearTimeout(id);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      className={[
        "rounded-xl border px-4 py-2.5 text-sm shadow-[0_1px_2px_rgba(61,52,40,0.04)]",
        TONE_CLASS[tone],
        className,
      ].join(" ")}
    >
      {message}
    </div>
  );
}
