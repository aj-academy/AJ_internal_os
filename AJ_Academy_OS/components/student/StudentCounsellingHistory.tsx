"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CounsellingRow = {
  id: string;
  purpose: string;
  mode: string;
  session_at: string;
  duration_minutes: number | null;
  meeting_link: string | null;
  venue: string | null;
  status: string;
  mentor_name?: string;
};

export function StudentCounsellingHistory() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<CounsellingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Please sign in again.");
      setLoading(false);
      return;
    }

    const { data, error: qErr } = await supabase
      .from("counselling_sessions")
      .select("id,purpose,mode,session_at,duration_minutes,meeting_link,venue,status,mentor_id")
      .eq("student_id", user.id)
      .order("session_at", { ascending: false })
      .limit(50);

    if (qErr) {
      if (/relation|does not exist/i.test(qErr.message)) {
        setError("Run counselling_sessions_patch.sql in Supabase.");
      } else {
        setError(qErr.message);
      }
      setRows([]);
      setLoading(false);
      return;
    }

    const raw = data ?? [];
    const mentorIds = [...new Set(raw.map((r) => r.mentor_id).filter(Boolean))] as string[];
    const { data: mentors } = mentorIds.length
      ? await supabase.from("profiles").select("id,full_name,email").in("id", mentorIds)
      : { data: [] };
    const mentorMap = Object.fromEntries(
      (mentors ?? []).map((m) => [m.id, m.full_name || m.email || m.id.slice(0, 8)]),
    );

    setRows(
      raw.map((r) => ({
        ...r,
        mentor_name: r.mentor_id ? mentorMap[r.mentor_id] : undefined,
      })),
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div>
        <h2 className="text-3xl font-semibold text-[#0f172a]">My counselling</h2>
        <p className="mt-1 text-sm text-[#64748b]">Sessions scheduled for you by admin or mentors.</p>
      </div>

      {error ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
        {loading ? (
          <p className="p-8 text-sm text-[#64748b]">Loading…</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#f1f6fc] text-xs uppercase text-[#64748b]">
              <tr>
                {["Purpose", "When", "Mode", "Mentor", "Link / venue", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef2ff]">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium">{row.purpose}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(row.session_at).toLocaleString()}</td>
                  <td className="px-4 py-3 capitalize">{row.mode}</td>
                  <td className="px-4 py-3">{row.mentor_name ?? "—"}</td>
                  <td className="max-w-[200px] px-4 py-3 text-xs">
                    {row.mode === "online" && row.meeting_link ? (
                      <a href={row.meeting_link} target="_blank" rel="noopener noreferrer" className="text-[#2563eb] underline">
                        Join meeting
                      </a>
                    ) : (
                      row.venue || "—"
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize">{row.status}</td>
                </tr>
              ))}
              {!rows.length && !loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#64748b]">
                    No counselling sessions scheduled yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
