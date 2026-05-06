"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminAttendanceAutoRefresh() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [enabled, seconds, router]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#dbe6f3] bg-white px-3 py-2">
      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="h-3.5 w-3.5 rounded border-[#cfdceb]"
        />
        Auto refresh
      </label>
      <select
        value={seconds}
        onChange={(event) => setSeconds(Number(event.target.value))}
        disabled={!enabled}
        className="h-7 rounded-md border border-[#cfdceb] bg-white px-2 text-xs text-slate-700 disabled:opacity-60"
      >
        <option value={15}>15s</option>
        <option value={30}>30s</option>
        <option value={60}>60s</option>
      </select>
      <span className="text-[11px] text-slate-500">
        {enabled ? "Live updates enabled" : "Off"}
      </span>
    </div>
  );
}
