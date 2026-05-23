"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/profile";

interface AttendanceRecord {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string | null;
  total_working_minutes: number | null;
}

function getTodayLocalDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatHours(minutes: number | null) {
  if (minutes === null || minutes < 0) return "-";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function StudentAttendancePage() {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [busy, setBusy] = useState<"idle" | "checkin" | "checkout" | "loading">("loading");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [liveNow, setLiveNow] = useState(new Date());

  const loadData = useCallback(
    async (uid: string) => {
      const today = getTodayLocalDate();
      const [todayRes, historyRes] = await Promise.all([
        supabase
          .from("attendance_records")
          .select("id,employee_id,attendance_date,check_in_time,check_out_time,status,total_working_minutes")
          .eq("employee_id", uid)
          .eq("attendance_date", today)
          .order("check_in_time", { ascending: false })
          .limit(1)
          .maybeSingle<AttendanceRecord>(),
        supabase
          .from("attendance_records")
          .select("id,employee_id,attendance_date,check_in_time,check_out_time,status,total_working_minutes")
          .eq("employee_id", uid)
          .order("attendance_date", { ascending: false })
          .limit(10)
          .returns<AttendanceRecord[]>(),
      ]);
      setTodayRecord(todayRes.data ?? null);
      setHistory(historyRes.data ?? []);
    },
    [supabase],
  );

  useEffect(() => {
    const bootstrap = async () => {
      setBusy("loading");
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setMessage({ type: "error", text: "Please sign in again." });
          return;
        }
        setUserId(user.id);
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id,full_name,email,role,department,designation,status,created_at")
          .eq("id", user.id)
          .maybeSingle<Profile>();
        setProfile(profileData ?? null);
        await loadData(user.id);
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to load attendance." });
      } finally {
        setBusy("idle");
      }
    };
    void bootstrap();
  }, [loadData, supabase]);

  useEffect(() => {
    const interval = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const canCheckIn = !todayRecord?.check_in_time;
  const canCheckOut = Boolean(todayRecord?.check_in_time) && !todayRecord?.check_out_time;

  const displayName =
    profile?.full_name?.trim() ||
    (profile?.email?.includes("@") ? profile.email.split("@")[0] : "Student");

  const handleCheckIn = async () => {
    if (!userId) return;
    setBusy("checkin");
    setMessage(null);
    try {
      const nowIso = new Date().toISOString();
      const today = getTodayLocalDate();
      const { error } = await supabase.from("attendance_records").insert({
        employee_id: userId,
        attendance_date: today,
        check_in_time: nowIso,
        status: "present",
        location_type: "Campus",
      });
      if (error) throw error;
      await loadData(userId);
      setMessage({ type: "success", text: "Checked in successfully." });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Check-in failed." });
    } finally {
      setBusy("idle");
    }
  };

  const handleCheckOut = async () => {
    if (!userId || !todayRecord?.id || !todayRecord.check_in_time) return;
    setBusy("checkout");
    setMessage(null);
    try {
      const now = new Date();
      const nowIso = now.toISOString();
      const checkInAt = new Date(todayRecord.check_in_time);
      const totalMinutes = Math.max(1, Math.ceil((now.getTime() - checkInAt.getTime()) / 60000));
      const { error } = await supabase
        .from("attendance_records")
        .update({
          check_out_time: nowIso,
          total_working_minutes: totalMinutes,
          status: "completed",
        })
        .eq("id", todayRecord.id)
        .eq("employee_id", userId);
      if (error) throw error;
      await loadData(userId);
      setMessage({ type: "success", text: "Checked out successfully." });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Check-out failed." });
    } finally {
      setBusy("idle");
    }
  };

  return (
    <section className="space-y-6 rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-[0_20px_40px_rgba(180,140,60,0.08)] sm:p-6 lg:p-8">
      <div>
        <h2 className="text-3xl font-semibold text-[#3d3428]">My Attendance</h2>
        <p className="mt-1 text-sm text-[#6b5d4d]">Mark your daily presence for classes and sessions.</p>
      </div>

      {message ? (
        <div
          className={[
            "rounded-xl border px-4 py-2 text-sm",
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700",
          ].join(" ")}
        >
          {message.text}
        </div>
      ) : null}

      <article className="rounded-2xl border border-[#ede4d4] bg-[#fffdf8] p-5">
        <h3 className="mb-3 text-lg font-semibold text-[#3d3428]">Today</h3>
        <div className="stat-cards-grid">
          <Info label="Student" value={displayName} />
          <Info label="Date" value={liveNow.toLocaleDateString()} />
          <Info label="Time" value={liveNow.toLocaleTimeString()} />
          <Info
            label="Status"
            value={
              todayRecord?.check_out_time
                ? "Completed"
                : todayRecord?.check_in_time
                  ? "Present"
                  : "Not checked in"
            }
          />
          <Info label="Duration" value={formatHours(todayRecord?.total_working_minutes ?? null)} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canCheckIn || busy !== "idle"}
            onClick={handleCheckIn}
            className="rounded-xl bg-[#c9a227] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b8921f] disabled:opacity-50"
          >
            {busy === "checkin" ? "Checking in…" : "Check In"}
          </button>
          <button
            type="button"
            disabled={!canCheckOut || busy !== "idle"}
            onClick={handleCheckOut}
            className="rounded-xl border border-[#e8dcc8] bg-white px-4 py-2 text-sm font-semibold text-[#3d3428] hover:bg-[#faf6ee] disabled:opacity-50"
          >
            {busy === "checkout" ? "Checking out…" : "Check Out"}
          </button>
        </div>
      </article>

      <article className="rounded-2xl border border-[#ede4d4] bg-white p-5">
        <h3 className="mb-3 text-lg font-semibold text-[#3d3428]">Recent history</h3>
        <div className="overflow-x-auto rounded-xl border border-[#ede4d4]">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-[#faf6ee] text-[#6b5d4d]">
              <tr>
                {["Date", "Check in", "Check out", "Duration", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0e8da]">
              {history.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">{row.attendance_date}</td>
                  <td className="px-4 py-3">{formatTime(row.check_in_time)}</td>
                  <td className="px-4 py-3">{formatTime(row.check_out_time)}</td>
                  <td className="px-4 py-3">{formatHours(row.total_working_minutes)}</td>
                  <td className="px-4 py-3 capitalize">{row.status ?? "-"}</td>
                </tr>
              ))}
              {!history.length && busy !== "loading" ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[#6b5d4d]">
                    No records yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#ede4d4] bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-[#6b5d4d]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#3d3428]">{value}</p>
    </div>
  );
}
