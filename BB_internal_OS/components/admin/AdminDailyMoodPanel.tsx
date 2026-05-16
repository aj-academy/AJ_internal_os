"use client";

import { useMemo } from "react";

export type DailyMoodRow = {
  id: string;
  employee_id: string;
  mood: string;
  mood_date: string;
  created_at: string;
  employee_name: string;
};

const MOOD_EMOJI: Record<string, string> = {
  happy: "😊",
  excited: "🤩",
  neutral: "😐",
  tired: "😴",
  sad: "😢",
  angry: "😠",
};

const MOOD_LABEL: Record<string, string> = {
  happy: "Happy",
  excited: "Excited",
  neutral: "Neutral",
  tired: "Tired",
  sad: "Sad",
  angry: "Angry",
};

export function AdminDailyMoodPanel({ rows, todayLabel }: { rows: DailyMoodRow[]; todayLabel: string }) {
  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      counts[r.mood] = (counts[r.mood] ?? 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <section className="rounded-2xl border border-[#d4deea] bg-[#f8fbff] p-4 sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[#0f172a] sm:text-lg">How employees feel today</h3>
          <p className="text-xs text-[#64748b]">
            Daily mood check-in · {todayLabel} · stored in{" "}
            <code className="rounded bg-white px-1 py-0.5 text-[11px]">employee_daily_mood_checkins</code>
          </p>
        </div>
        <p className="text-sm font-semibold text-[#2563eb]">{rows.length} responses</p>
      </div>

      {summary.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {summary.map(([mood, count]) => (
            <span
              key={mood}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dbe6f3] bg-white px-3 py-1 text-sm text-[#334155]"
            >
              <span aria-hidden>{MOOD_EMOJI[mood] ?? "🙂"}</span>
              {MOOD_LABEL[mood] ?? mood} <span className="font-semibold text-[#0f172a]">{count}</span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-[#dbe6f3] bg-white">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-[#f1f6fc] text-xs uppercase tracking-wide text-[#64748b]">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Mood</th>
              <th className="px-3 py-2">Submitted (IST)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-[#64748b]">
                  No mood responses yet today. Employees see a popup on login until they pick an emoji.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-[#eef2f7]">
                  <td className="px-3 py-2 font-medium text-[#0f172a]">{row.employee_name}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-lg" aria-hidden>
                        {MOOD_EMOJI[row.mood] ?? "🙂"}
                      </span>
                      {MOOD_LABEL[row.mood] ?? row.mood}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[#64748b]">
                    {new Date(row.created_at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
