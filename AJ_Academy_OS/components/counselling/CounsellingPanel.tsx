"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

type CounsellingRow = {
  id: string;
  student_id: string;
  mentor_id: string | null;
  purpose: string;
  mode: string;
  session_at: string;
  duration_minutes: number | null;
  meeting_link: string | null;
  venue: string | null;
  notes: string | null;
  status: string;
  student_name?: string;
  mentor_name?: string;
};

type ProfileOpt = { id: string; label: string };

interface CounsellingPanelProps {
  mode: "admin" | "view";
}

export function CounsellingPanel({ mode }: CounsellingPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = mode === "admin";
  const [rows, setRows] = useState<CounsellingRow[]>([]);
  const [students, setStudents] = useState<ProfileOpt[]>([]);
  const [mentors, setMentors] = useState<ProfileOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [userId, setUserId] = useState("");

  const [form, setForm] = useState({
    student_id: "",
    mentor_id: "",
    purpose: "",
    mode: "online" as "online" | "offline",
    session_at: "",
    duration_minutes: "30",
    meeting_link: "",
    venue: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: qErr } = await supabase
      .from("counselling_sessions")
      .select(
        "id,student_id,mentor_id,purpose,mode,session_at,duration_minutes,meeting_link,venue,notes,status",
      )
      .order("session_at", { ascending: true })
      .limit(100);

    if (qErr) {
      if (/relation|does not exist/i.test(qErr.message)) {
        setSchemaMissing(true);
        setRows([]);
        setLoading(false);
        return;
      }
      setError(qErr.message);
      setLoading(false);
      return;
    }

    const raw = (data ?? []) as CounsellingRow[];
    const ids = [...new Set([...raw.map((r) => r.student_id), ...raw.map((r) => r.mentor_id).filter(Boolean)])] as string[];
    const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const map = Object.fromEntries(
      (profs ?? []).map((p) => [p.id, p.full_name || p.email || p.id.slice(0, 8)]),
    );

    setRows(
      raw.map((r) => ({
        ...r,
        student_name: map[r.student_id],
        mentor_name: r.mentor_id ? map[r.mentor_id] : undefined,
      })),
    );
    setSchemaMissing(false);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) setUserId(user.id);
      if (isAdmin) {
        const { data: st } = await supabase
          .from("profiles")
          .select("id,full_name,email")
          .eq("role", "student")
          .or("status.is.null,status.eq.active")
          .order("full_name");
        const { data: mt } = await supabase
          .from("profiles")
          .select("id,full_name,email")
          .eq("role", "mentor")
          .or("status.is.null,status.eq.active")
          .order("full_name");
        setStudents(
          (st ?? []).map((p) => ({ id: p.id, label: p.full_name || p.email || p.id.slice(0, 8) })),
        );
        setMentors(
          (mt ?? []).map((p) => ({ id: p.id, label: p.full_name || p.email || p.id.slice(0, 8) })),
        );
      }
    })();
  }, [isAdmin, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !form.student_id || !form.purpose.trim() || !form.session_at) {
      setError("Student, purpose, and date/time are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: insErr } = await supabase.from("counselling_sessions").insert({
        student_id: form.student_id,
        mentor_id: form.mentor_id || null,
        scheduled_by: userId,
        purpose: form.purpose.trim(),
        mode: form.mode,
        session_at: new Date(form.session_at).toISOString(),
        duration_minutes: parseInt(form.duration_minutes, 10) || 30,
        meeting_link: form.mode === "online" ? form.meeting_link.trim() || null : null,
        venue: form.mode === "offline" ? form.venue.trim() || null : null,
        notes: form.notes.trim() || null,
        status: "scheduled",
      });
      if (insErr) throw insErr;

      const { data: student } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", form.student_id)
        .maybeSingle();

      await supabase.from("in_app_notifications").insert({
        user_id: form.student_id,
        type: "counselling_scheduled",
        title: "Counselling scheduled",
        body: `Session: ${form.purpose.trim()} (${form.mode})`,
        link_path: "/student/dashboard",
        meta: {},
      });

      if (form.mentor_id) {
        await supabase.from("in_app_notifications").insert({
          user_id: form.mentor_id,
          type: "counselling_scheduled",
          title: "Counselling assigned",
          body: `Student ${student?.full_name ?? ""} — ${form.purpose.trim()}`,
          link_path: "/mentor/counselling",
          meta: {},
        });
      }

      setSuccess("Counselling session scheduled.");
      setForm({
        student_id: "",
        mentor_id: "",
        purpose: "",
        mode: "online",
        session_at: "",
        duration_minutes: "30",
        meeting_link: "",
        venue: "",
        notes: "",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not schedule.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-6 rounded-[24px] border border-[#e8dcc8] bg-white p-4 sm:p-6 lg:p-8">
      <div>
        <h2 className="text-2xl font-semibold text-[#3d3428]">Student counselling</h2>
        <p className="mt-1 text-sm text-[#6b5d4d]">
          Schedule career or academic counselling — online (meet link) or offline (venue). Students and mentors are notified in-app.
        </p>
      </div>

      {schemaMissing ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Run <strong>aj_academy_platform_expansion.sql</strong> in Supabase.
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      {isAdmin && !schemaMissing ? (
        <form onSubmit={onSchedule} className="rounded-2xl border border-[#ede4d4] bg-[#fffdf8] p-5 space-y-3">
          <h3 className="font-semibold text-[#3d3428]">Schedule session</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Student *</span>
              <select
                className="h-9 w-full rounded-xl border border-[#e8dcc8] px-3"
                value={form.student_id}
                onChange={(e) => setForm((p) => ({ ...p, student_id: e.target.value }))}
                required
              >
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Mentor (optional)</span>
              <select
                className="h-9 w-full rounded-xl border border-[#e8dcc8] px-3"
                value={form.mentor_id}
                onChange={(e) => setForm((p) => ({ ...p, mentor_id: e.target.value }))}
              >
                <option value="">Auto / none</option>
                {mentors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">Purpose *</span>
              <Input
                value={form.purpose}
                onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))}
                placeholder="e.g. Career guidance, placement prep, stress check-in"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Mode</span>
              <select
                className="h-9 w-full rounded-xl border border-[#e8dcc8] px-3"
                value={form.mode}
                onChange={(e) => setForm((p) => ({ ...p, mode: e.target.value as "online" | "offline" }))}
              >
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Date & time *</span>
              <Input
                type="datetime-local"
                value={form.session_at}
                onChange={(e) => setForm((p) => ({ ...p, session_at: e.target.value }))}
                required
              />
            </label>
            {form.mode === "online" ? (
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium">Meeting link</span>
                <Input
                  value={form.meeting_link}
                  onChange={(e) => setForm((p) => ({ ...p, meeting_link: e.target.value }))}
                  placeholder="https://meet.google.com/..."
                />
              </label>
            ) : (
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium">Venue</span>
                <Input
                  value={form.venue}
                  onChange={(e) => setForm((p) => ({ ...p, venue: e.target.value }))}
                  placeholder="Campus room / address"
                />
              </label>
            )}
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">Notes</span>
              <textarea
                rows={2}
                className="w-full rounded-xl border border-[#e8dcc8] px-3 py-2 text-sm"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </label>
          </div>
          <Button type="submit" disabled={submitting} className="rounded-xl bg-[#c9a227] text-white">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Schedule counselling
          </Button>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[#ede4d4]">
        {loading ? (
          <p className="p-8 text-sm text-[#6b5d4d]">Loading…</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#faf6ee] text-[#6b5d4d]">
              <tr>
                {["Student", "Mentor", "Purpose", "When", "Mode", "Link / venue", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0e8da]">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{row.student_name ?? "—"}</td>
                  <td className="px-4 py-3">{row.mentor_name ?? "—"}</td>
                  <td className="px-4 py-3">{row.purpose}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(row.session_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 capitalize">{row.mode}</td>
                  <td className="max-w-[200px] px-4 py-3 text-xs">
                    {row.mode === "online" && row.meeting_link ? (
                      <a href={row.meeting_link} target="_blank" rel="noopener noreferrer" className="text-[#a68b2e] underline">
                        Join meeting
                      </a>
                    ) : (
                      row.venue || "—"
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize">{row.status}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#6b5d4d]">
                    No sessions scheduled.
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
