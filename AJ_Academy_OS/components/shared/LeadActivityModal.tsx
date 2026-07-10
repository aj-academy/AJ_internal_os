"use client";

import { X } from "lucide-react";
import { formatDateTimeIST } from "@/lib/datetime";

export type LeadActivityItem = {
  id: string;
  activity_type: string | null;
  notes: string | null;
  old_value?: string | null;
  new_value?: string | null;
  created_at: string;
  created_by?: string | null;
};

type LeadActivityModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  loading: boolean;
  activities: LeadActivityItem[];
  employeeNameMap?: Record<string, string>;
  onClose: () => void;
};

export function LeadActivityModal({
  open,
  title,
  subtitle = "From lead_activities",
  loading,
  activities,
  employeeNameMap = {},
  onClose,
}: LeadActivityModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-[#d4deea] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#eef2f7] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[#0f172a]">{title}</p>
            <p className="text-xs text-[#64748b]">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-[#f1f5f9]" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="py-6 text-center text-sm text-[#64748b]">Loading…</p>
          ) : !activities.length ? (
            <p className="py-6 text-center text-sm text-[#64748b]">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {activities.map((a) => {
                const by = a.created_by ? employeeNameMap[a.created_by] || "Team member" : "—";
                return (
                  <li key={a.id} className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-3 py-2">
                    <p className="text-sm font-medium text-[#0f172a]">{a.activity_type || "Activity"}</p>
                    {a.notes ? <p className="mt-1 whitespace-pre-wrap text-xs text-[#64748b]">{a.notes}</p> : null}
                    {a.old_value || a.new_value ? (
                      <p className="mt-0.5 text-xs text-[#64748b]">
                        {a.old_value} → {a.new_value}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-[#94a3b8]">
                      {formatDateTimeIST(a.created_at)}
                      {a.created_by ? ` · ${by}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
