"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/profile";
type LocationPoint = { latitude: number; longitude: number };

interface AttendanceRecord {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  check_in_address: string | null;
  check_out_address: string | null;
  location_type: string | null;
  status: string | null;
  total_working_minutes: number | null;
}

interface AttendanceWritePayload {
  employee_id: string;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  check_in_address: string | null;
  check_out_address: string | null;
  location_type: string | null;
  status: string | null;
  total_working_minutes: number | null;
}

interface WorkSummaryRecord {
  id: string;
  attendance_id: string | null;
  status: string | null;
}

interface CheckoutFormState {
  completedWork: string;
  pendingWork: string;
  challenges: string;
  tomorrowPlan: string;
}

const initialCheckoutForm: CheckoutFormState = {
  completedWork: "",
  pendingWork: "",
  challenges: "",
  tomorrowPlan: "",
};

function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function formatHours(minutes: number | null) {
  if (minutes === null || minutes < 0) return "-";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

async function resolveAddress(location: LocationPoint): Promise<string | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${location.latitude}&lon=${location.longitude}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}

function getGeoLocation(): Promise<LocationPoint> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => reject(new Error("Location permission is required for check-in.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

function toReadableAttendanceError(input: unknown) {
  const raw =
    typeof input === "object" && input !== null && "message" in input
      ? String((input as { message?: unknown }).message ?? "Unexpected error.")
      : input instanceof Error
        ? input.message
        : "Unexpected error.";

  const lowered = raw.toLowerCase();
  if (
    lowered.includes("permission denied") ||
    lowered.includes("forbidden") ||
    lowered.includes("row-level security")
  ) {
    return "Attendance write/read permission is blocked by Supabase RLS. Run `supabase/attendance_rls.sql` in Supabase SQL Editor, then retry.";
  }
  return raw;
}

async function getLatestTodayRecord(
  supabase: ReturnType<typeof createClient>,
  currentEmployeeId: string,
): Promise<AttendanceRecord | null> {
  const today = getTodayLocalDate();
  const { data, error } = await supabase
    .from("attendance_records")
    .select(
      "id,employee_id,attendance_date,check_in_time,check_out_time,check_in_latitude,check_in_longitude,check_out_latitude,check_out_longitude,check_in_address,check_out_address,location_type,status,total_working_minutes",
    )
    .eq("employee_id", currentEmployeeId)
    .eq("attendance_date", today)
    .order("check_in_time", { ascending: false, nullsFirst: false })
    .limit(1)
    .returns<AttendanceRecord[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data?.[0] ?? null;
}

export default function EmployeeAttendancePage() {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState(getTodayLocalDate());
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [summaryStatusMap, setSummaryStatusMap] = useState<Record<string, string>>({});
  const [checkoutForm, setCheckoutForm] = useState<CheckoutFormState>(initialCheckoutForm);
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [busy, setBusy] = useState<"idle" | "checkin" | "checkout" | "loading">("loading");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [liveNow, setLiveNow] = useState(new Date());

  const loadAttendanceData = useCallback(
    async (currentEmployeeId: string) => {
      const [todayRow, { data: historyData, error: historyError }] = await Promise.all([
        getLatestTodayRecord(supabase, currentEmployeeId),
        supabase
          .from("attendance_records")
          .select(
            "id,employee_id,attendance_date,check_in_time,check_out_time,check_in_latitude,check_in_longitude,check_out_latitude,check_out_longitude,check_in_address,check_out_address,location_type,status,total_working_minutes",
          )
          .eq("employee_id", currentEmployeeId)
          .order("attendance_date", { ascending: false })
          .limit(10)
          .returns<AttendanceRecord[]>(),
      ]);

      if (historyError) {
        throw new Error(historyError.message);
      }

      setTodayRecord(todayRow);
      const records = historyData ?? [];
      setHistory(records);

      if (!records.length) {
        setSummaryStatusMap({});
        return;
      }

      const attendanceIds = records.map((record) => record.id);
      const { data: summaries } = await supabase
        .from("work_summaries")
        .select("id,attendance_id,status")
        .eq("employee_id", currentEmployeeId)
        .in("attendance_id", attendanceIds)
        .returns<WorkSummaryRecord[]>();

      const map: Record<string, string> = {};
      (summaries ?? []).forEach((summary) => {
        if (summary.attendance_id) {
          map[summary.attendance_id] = summary.status ?? "submitted";
        }
      });
      setSummaryStatusMap(map);
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
          setMessage({ type: "error", text: "Unable to read logged-in user session." });
          return;
        }

        setUserEmail(user.email ?? "");
        setEmployeeId(user.id);

        const [{ data: profileData }] = await Promise.all([
          supabase
            .from("profiles")
            .select("id,full_name,email,role,department,designation,status,created_at")
            .eq("id", user.id)
            .maybeSingle<Profile>(),
          loadAttendanceData(user.id),
        ]);

        setProfile(profileData ?? null);
      } catch (error) {
        const text = toReadableAttendanceError(error);
        setMessage({ type: "error", text });
      } finally {
        setBusy("idle");
      }
    };

    void bootstrap();
  }, [loadAttendanceData, supabase, todayKey]);

  useEffect(() => {
    const interval = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const nextToday = getTodayLocalDate();
      setTodayKey((prev) => (prev === nextToday ? prev : nextToday));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const todayStatusLabel = useMemo(() => {
    if (!todayRecord) return "Not Checked In";
    if (todayRecord.check_in_time && todayRecord.check_out_time) return "Completed";
    if (todayRecord.check_in_time) return "Present";
    return "Not Checked In";
  }, [todayRecord]);

  const canCheckIn = !todayRecord || (!todayRecord.check_in_time && !todayRecord.check_out_time);
  const canCheckOut = Boolean(todayRecord?.check_in_time) && !todayRecord?.check_out_time;

  const displayEmployeeName = useMemo(() => {
    const byProfile = profile?.full_name?.trim();
    if (byProfile) return byProfile;
    const mail = profile?.email?.trim() || userEmail.trim();
    if (mail && mail.includes("@")) return mail.split("@")[0];
    return "Employee";
  }, [profile?.full_name, profile?.email, userEmail]);

  const handleCheckIn = async () => {
    if (!employeeId) return;
    setMessage(null);
    setBusy("checkin");

    try {
      const existingToday = await getLatestTodayRecord(supabase, employeeId);
      if (existingToday?.check_in_time) {
        setMessage({ type: "error", text: "You have already checked in for today." });
        setBusy("idle");
        return;
      }

      const location = await getGeoLocation();
      const address = await resolveAddress(location);
      const nowIso = new Date().toISOString();
      const today = getTodayLocalDate();

      const payload: AttendanceWritePayload = {
        employee_id: employeeId,
        attendance_date: today,
        check_in_time: nowIso,
        check_out_time: null,
        check_in_latitude: location.latitude,
        check_in_longitude: location.longitude,
        check_out_latitude: null,
        check_out_longitude: null,
        check_in_address: address,
        check_out_address: null,
        status: "present",
        location_type: "Remote",
        total_working_minutes: null,
      };

      let error: { message: string } | null = null;
      if (existingToday?.id) {
        const updateResult = await supabase
          .from("attendance_records")
          .update({
            check_in_time: nowIso,
            check_in_latitude: location.latitude,
            check_in_longitude: location.longitude,
            check_in_address: address,
            status: "present",
            location_type: "Remote",
          })
          .eq("id", existingToday.id)
          .eq("employee_id", employeeId);
        error = updateResult.error;
      } else {
        const insertResult = await supabase.from("attendance_records").insert(payload);
        error = insertResult.error;
      }

      if (error) throw error;

      await loadAttendanceData(employeeId);
      setMessage({ type: "success", text: "Check in successful." });
    } catch (error) {
      const text = toReadableAttendanceError(error);
      setMessage({ type: "error", text });
    } finally {
      setBusy("idle");
    }
  };

  const handleCheckOut = async () => {
    if (!employeeId) return;
    setMessage(null);

    const latestToday = await getLatestTodayRecord(supabase, employeeId);
    if (!latestToday?.check_in_time) {
      setMessage({ type: "error", text: "Cannot check out before check in." });
      return;
    }
    if (latestToday.check_out_time) {
      setMessage({ type: "error", text: "You have already checked out for today." });
      return;
    }
    if (!checkoutForm.completedWork.trim() || !checkoutForm.pendingWork.trim()) {
      setMessage({ type: "error", text: "Please fill completed work and pending work before check out." });
      return;
    }

    setBusy("checkout");

    try {
      const location = await getGeoLocation();
      const address = await resolveAddress(location);
      const now = new Date();
      const nowIso = now.toISOString();
      const checkInAt = new Date(latestToday.check_in_time);
      const diffMs = now.getTime() - checkInAt.getTime();
      const totalMinutes = diffMs > 0 ? Math.max(1, Math.ceil(diffMs / 60000)) : 0;

      const { error: updateError } = await supabase
        .from("attendance_records")
        .update({
          check_out_time: nowIso,
          check_out_latitude: location.latitude,
          check_out_longitude: location.longitude,
          check_out_address: address,
          total_working_minutes: totalMinutes,
          status: "completed",
          location_type: "Remote",
        })
        .eq("id", latestToday.id)
        .eq("employee_id", employeeId);

      if (updateError) throw updateError;

      const { error: summaryError } = await supabase.from("work_summaries").insert({
        employee_id: employeeId,
        attendance_id: latestToday.id,
        summary_date: getTodayLocalDate(),
        completed_work: checkoutForm.completedWork,
        pending_work: checkoutForm.pendingWork,
        challenges: checkoutForm.challenges,
        tomorrow_plan: checkoutForm.tomorrowPlan,
        status: "submitted",
      });

      if (summaryError) throw summaryError;

      await loadAttendanceData(employeeId);
      setCheckoutForm(initialCheckoutForm);
      setShowCheckoutForm(false);
      setMessage({ type: "success", text: "Check out and work summary submitted successfully." });
    } catch (error) {
      const text = toReadableAttendanceError(error);
      setMessage({ type: "error", text });
    } finally {
      setBusy("idle");
    }
  };

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div>
        <h2 className="text-3xl font-semibold text-slate-900">My Attendance</h2>
        <p className="mt-1 text-sm text-slate-600">Check in, check out, submit work summary and track attendance history.</p>
      </div>

      {message ? (
        <div
          className={[
            "rounded-xl border px-4 py-2 text-sm",
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700",
          ].join(" ")}
        >
          {message.text}
        </div>
      ) : null}

      <article className="rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-5">
        <h3 className="mb-3 text-lg font-semibold text-slate-900">Today Attendance</h3>
        <div className="stat-cards-grid">
          <Info label="Employee Name" value={displayEmployeeName} />
          <Info
            label="Today Date"
            value={liveNow.toLocaleDateString([], { year: "numeric", month: "short", day: "2-digit" })}
          />
          <Info
            label="Current Time"
            value={liveNow.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          />
          <Info label="Status" value={todayStatusLabel} />
          <Info label="Time Gap" value={formatHours(todayRecord?.total_working_minutes ?? null)} />
          <Info label="Location Type" value={todayRecord?.location_type ?? "Remote"} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            data-requires-online
            disabled={!canCheckIn || busy !== "idle"}
            onClick={handleCheckIn}
            className="rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#98b5ef] hover:bg-[#1d4ed8]"
          >
            {busy === "checkin" ? "Checking In..." : "Check In"}
          </button>
          <button
            type="button"
            disabled={!canCheckOut || busy !== "idle"}
            onClick={() => setShowCheckoutForm((prev) => !prev)}
            className="rounded-xl border border-[#cfdceb] bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60 hover:bg-[#eef4ff]"
          >
            {showCheckoutForm ? "Hide Check Out Form" : "Check Out"}
          </button>
        </div>
      </article>

      {showCheckoutForm ? (
        <article className="rounded-2xl border border-[#dbe6f3] bg-white p-5">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">Check Out Work Summary</h3>
          <div className="grid gap-3">
            <TextArea
              label="Completed Work"
              value={checkoutForm.completedWork}
              onChange={(value) => setCheckoutForm((prev) => ({ ...prev, completedWork: value }))}
            />
            <TextArea
              label="Pending Work"
              value={checkoutForm.pendingWork}
              onChange={(value) => setCheckoutForm((prev) => ({ ...prev, pendingWork: value }))}
            />
            <TextArea
              label="Challenges"
              value={checkoutForm.challenges}
              onChange={(value) => setCheckoutForm((prev) => ({ ...prev, challenges: value }))}
            />
            <TextArea
              label="Tomorrow Plan"
              value={checkoutForm.tomorrowPlan}
              onChange={(value) => setCheckoutForm((prev) => ({ ...prev, tomorrowPlan: value }))}
            />
          </div>
          <div className="mt-4">
            <button
              type="button"
              data-requires-online
              onClick={handleCheckOut}
              disabled={!canCheckOut || busy === "checkout"}
              className="rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#98b5ef] hover:bg-[#1d4ed8]"
            >
              {busy === "checkout" ? "Submitting..." : "Submit Check Out"}
            </button>
          </div>
        </article>
      ) : null}

      <article className="rounded-2xl border border-[#dbe6f3] bg-white p-5">
        <h3 className="mb-3 text-lg font-semibold text-slate-900">Attendance History (Last 10)</h3>
        <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead>
              <tr>
                {[
                  "Date",
                  "Check In",
                  "Check Out",
                  "Time Gap",
                  "Status",
                  "Location Type",
                  "Check In Location",
                  "Check Out Location",
                  "Work Summary Status",
                ].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((record) => (
                <tr key={record.id}>
                  <td className="whitespace-nowrap">{formatDate(record.attendance_date)}</td>
                  <td className="whitespace-nowrap">{formatTime(record.check_in_time)}</td>
                  <td className="whitespace-nowrap">{formatTime(record.check_out_time)}</td>
                  <td className="whitespace-nowrap">{formatHours(record.total_working_minutes)}</td>
                  <td className="capitalize">{record.status ?? "-"}</td>
                  <td>{record.location_type ?? "-"}</td>
                  <td className="min-w-[14rem] max-w-[22rem]">
                    {record.check_in_address ??
                      (record.check_in_latitude && record.check_in_longitude
                        ? `${record.check_in_latitude}, ${record.check_in_longitude}`
                        : "-")}
                  </td>
                  <td className="min-w-[14rem] max-w-[22rem]">
                    {record.check_out_address ??
                      (record.check_out_latitude && record.check_out_longitude
                        ? `${record.check_out_latitude}, ${record.check_out_longitude}`
                        : "-")}
                  </td>
                  <td className="capitalize">{summaryStatusMap[record.id] ?? "-"}</td>
                </tr>
              ))}
              {!history.length && busy !== "loading" ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    No attendance records found.
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
    <div className="rounded-xl border border-[#dbe6f3] bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="w-full rounded-xl border border-[#cfdceb] px-3 py-2 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe]"
      />
    </label>
  );
}
