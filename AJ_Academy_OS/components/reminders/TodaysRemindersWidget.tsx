"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Check, Clock } from "lucide-react";
import type { ReminderRow } from "@/types/reminders";
import { isOverdueReminder, todayDateIST } from "@/lib/reminders/reminderHelpers";

export function TodaysRemindersWidget({ href }: { href: string }) {
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reminders");
      const json = (await res.json()) as { reminders?: ReminderRow[]; schemaMissing?: boolean };
      setSchemaMissing(Boolean(json.schemaMissing));
      setRows(json.reminders ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = todayDateIST();
  const stats = useMemo(() => {
    const day = rows.filter((r) => r.reminder_date === today);
    return {
      overdue: day.filter((r) => isOverdueReminder(r) && r.status !== "Completed" && r.status !== "Cancelled").length,
      today: day.filter((r) => r.status !== "Cancelled").length,
      meetings: day.filter((r) => r.reminder_type === "Meeting" || r.reminder_type === "Appointment").length,
      followUps: day.filter((r) => /Follow-up/i.test(r.reminder_type)).length,
      completed: day.filter((r) => r.status === "Completed").length,
      upcoming: rows.filter((r) => r.reminder_date > today && r.status === "Scheduled").slice(0, 4),
      todayList: day.filter((r) => r.status !== "Completed" && r.status !== "Cancelled").slice(0, 5),
    };
  }, [rows, today]);

  const complete = async (id: string) => {
    await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete" }),
    });
    await load();
  };

  const snooze = async (id: string) => {
    await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "snooze", snooze_minutes: 10 }),
    });
    await load();
  };

  return (
    <section className="rounded-[22px] border border-[#e8dcc8] bg-white p-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Today&apos;s reminders</p>
          <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold text-[#0f172a]">
            <Bell className="h-5 w-5 text-[#c9a227]" />
            Reminders snapshot
          </h3>
        </div>
        <Link href={href} className="text-xs font-semibold text-[#2563eb] hover:underline">
          View all reminders
        </Link>
      </div>

      {schemaMissing ? (
        <p className="mt-3 text-xs text-amber-800">
          Run <code>aj_reminders_schema.sql</code> to enable this widget (additive SQL).
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-[#64748b]">Loading…</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="Overdue" value={stats.overdue} hot={stats.overdue > 0} />
            <Stat label="Today" value={stats.today} />
            <Stat label="Meetings" value={stats.meetings} />
            <Stat label="Follow-ups" value={stats.followUps} />
            <Stat label="Done today" value={stats.completed} />
          </div>

          <ul className="mt-4 space-y-2">
            {stats.todayList.length === 0 ? (
              <li className="text-sm text-[#94a3b8]">No open reminders today.</li>
            ) : (
              stats.todayList.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eef2f7] px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${isOverdueReminder(r) ? "text-rose-700" : "text-[#0f172a]"}`}>{r.title}</p>
                    <p className="text-xs text-[#64748b]">
                      <Clock className="mr-1 inline h-3 w-3" />
                      {r.is_all_day ? "All day" : (r.start_time || "").slice(0, 5)} · {r.reminder_type}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="text-xs font-semibold text-[#a68b2e]" onClick={() => void snooze(r.id)}>
                      Snooze
                    </button>
                    <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700" onClick={() => void complete(r.id)}>
                      <Check className="h-3 w-3" /> Done
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, hot }: { label: string; value: number; hot?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${hot ? "border-rose-200 bg-rose-50" : "border-[#eef2f7] bg-[#fafcff]"}`}>
      <p className="text-[10px] font-semibold uppercase text-[#94a3b8]">{label}</p>
      <p className={`text-lg font-semibold ${hot ? "text-rose-700" : "text-[#0f172a]"}`}>{value}</p>
    </div>
  );
}
