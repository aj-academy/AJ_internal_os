"use client";

import { WifiOff } from "lucide-react";
import { OFFLINE_BANNER_MESSAGE } from "@/lib/pwa/constants";

export function OfflineBanner({ isOnline }: { isOnline: boolean }) {
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[100] flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-950"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span>{OFFLINE_BANNER_MESSAGE}</span>
    </div>
  );
}
