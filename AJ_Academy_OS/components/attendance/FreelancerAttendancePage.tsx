"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
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
  check_in_selfie_url: string | null;
  location_type: string | null;
  status: string | null;
  total_working_minutes: number | null;
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

async function resolveAddress(location: LocationPoint): Promise<string | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${location.latitude}&lon=${location.longitude}`,
      { headers: { Accept: "application/json" } },
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
      reject(new Error("Geolocation is not supported."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () => reject(new Error("Location permission is required for check-in.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

async function getLatestTodayRecord(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<AttendanceRecord | null> {
  const { data } = await supabase
    .from("attendance_records")
    .select(
      "id,employee_id,attendance_date,check_in_time,check_out_time,check_in_latitude,check_in_longitude,check_out_latitude,check_out_longitude,check_in_address,check_out_address,check_in_selfie_url,location_type,status,total_working_minutes",
    )
    .eq("employee_id", userId)
    .eq("attendance_date", getTodayLocalDate())
    .order("check_in_time", { ascending: false })
    .limit(1)
    .maybeSingle<AttendanceRecord>();
  return data ?? null;
}

export function FreelancerAttendancePage() {
  const supabase = useMemo(() => createClient(), []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [checkoutForm, setCheckoutForm] = useState(initialCheckoutForm);
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);
  const [busy, setBusy] = useState<"idle" | "checkin" | "checkout" | "loading">("loading");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [liveNow, setLiveNow] = useState(new Date());
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const loadAttendanceData = useCallback(
    async (uid: string) => {
      const { data: historyData } = await supabase
        .from("attendance_records")
        .select(
          "id,employee_id,attendance_date,check_in_time,check_out_time,check_in_latitude,check_in_longitude,check_out_latitude,check_out_longitude,check_in_address,check_out_address,check_in_selfie_url,location_type,status,total_working_minutes",
        )
        .eq("employee_id", uid)
        .order("attendance_date", { ascending: false })
        .limit(10)
        .returns<AttendanceRecord[]>();
      const todayRow = await getLatestTodayRecord(supabase, uid);
      setTodayRecord(todayRow);
      setHistory(historyData ?? []);
    },
    [supabase],
  );

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setMessage({ type: "error", text: "Camera access is required for selfie check-in." });
    }
  }, [stopCamera]);

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
        await loadAttendanceData(user.id);
        await startCamera();
      } finally {
        setBusy("idle");
      }
    };
    void bootstrap();
    return () => stopCamera();
  }, [loadAttendanceData, startCamera, stopCamera, supabase]);

  useEffect(() => {
    const interval = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const canCheckIn = !todayRecord?.check_in_time;
  const canCheckOut = Boolean(todayRecord?.check_in_time) && !todayRecord?.check_out_time;

  const displayName =
    profile?.full_name?.trim() ||
    (profile?.email?.includes("@") ? profile.email.split("@")[0] : "Freelancer");

  const captureSelfieBlob = async (): Promise<Blob> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      throw new Error("Camera not ready. Allow camera access and try again.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not capture image.");
    ctx.drawImage(video, 0, 0);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not create selfie image."))),
        "image/jpeg",
        0.85,
      );
    });
  };

  const uploadSelfie = async (uid: string, blob: Blob): Promise<string> => {
    const path = `${uid}/${getTodayLocalDate()}-checkin.jpg`;
    const { error } = await supabase.storage.from("attendance-selfies").upload(path, blob, {
      upsert: true,
      contentType: "image/jpeg",
    });
    if (error) throw error;
    const { data } = supabase.storage.from("attendance-selfies").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleCheckIn = async () => {
    if (!userId) return;
    setMessage(null);
    setBusy("checkin");
    try {
      const existingToday = await getLatestTodayRecord(supabase, userId);
      if (existingToday?.check_in_time) {
        setMessage({ type: "error", text: "You have already checked in today." });
        return;
      }

      const selfieBlob = await captureSelfieBlob();
      const previewUrl = URL.createObjectURL(selfieBlob);
      setSelfiePreview(previewUrl);

      const selfieUrl = await uploadSelfie(userId, selfieBlob);
      const location = await getGeoLocation();
      const address = await resolveAddress(location);
      const nowIso = new Date().toISOString();
      const today = getTodayLocalDate();

      const base = {
        employee_id: userId,
        attendance_date: today,
        check_in_time: nowIso,
        check_in_latitude: location.latitude,
        check_in_longitude: location.longitude,
        check_in_address: address,
        check_in_selfie_url: selfieUrl,
        status: "present",
        location_type: "Remote",
      };

      const { error } = existingToday?.id
        ? await supabase.from("attendance_records").update(base).eq("id", existingToday.id)
        : await supabase.from("attendance_records").insert(base);

      if (error) throw error;
      await loadAttendanceData(userId);
      setMessage({ type: "success", text: "Check-in with selfie recorded." });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Check-in failed." });
    } finally {
      setBusy("idle");
    }
  };

  const handleCheckOut = async () => {
    if (!userId) return;
    const latestToday = await getLatestTodayRecord(supabase, userId);
    if (!latestToday?.check_in_time) {
      setMessage({ type: "error", text: "Check in before checking out." });
      return;
    }
    if (!checkoutForm.completedWork.trim() || !checkoutForm.pendingWork.trim()) {
      setMessage({ type: "error", text: "Fill completed and pending work before check-out." });
      return;
    }
    setBusy("checkout");
    try {
      const location = await getGeoLocation();
      const address = await resolveAddress(location);
      const now = new Date();
      const nowIso = now.toISOString();
      const totalMinutes = Math.max(
        1,
        Math.ceil((now.getTime() - new Date(latestToday.check_in_time!).getTime()) / 60000),
      );

      const { error: updateError } = await supabase
        .from("attendance_records")
        .update({
          check_out_time: nowIso,
          check_out_latitude: location.latitude,
          check_out_longitude: location.longitude,
          check_out_address: address,
          total_working_minutes: totalMinutes,
          status: "completed",
        })
        .eq("id", latestToday.id);

      if (updateError) throw updateError;

      await supabase.from("work_summaries").insert({
        employee_id: userId,
        attendance_id: latestToday.id,
        summary_date: getTodayLocalDate(),
        completed_work: checkoutForm.completedWork,
        pending_work: checkoutForm.pendingWork,
        challenges: checkoutForm.challenges,
        tomorrow_plan: checkoutForm.tomorrowPlan,
        status: "submitted",
      });

      await loadAttendanceData(userId);
      setCheckoutForm(initialCheckoutForm);
      setShowCheckoutForm(false);
      setMessage({ type: "success", text: "Check-out submitted." });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Check-out failed." });
    } finally {
      setBusy("idle");
    }
  };

  return (
    <section className="space-y-6 rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-[0_20px_40px_rgba(180,140,60,0.08)] sm:p-6 lg:p-8">
      <div>
        <h2 className="text-3xl font-semibold text-[#3d3428]">Freelancer Attendance</h2>
        <p className="mt-1 text-sm text-[#6b5d4d]">
          Check in with a live selfie, location, and submit your work summary on check-out.
        </p>
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
        <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-[#3d3428]">
          <Camera className="h-5 w-5 text-[#c9a227]" />
          Selfie check-in
        </h3>
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="relative aspect-[4/3] w-full max-w-sm overflow-hidden rounded-xl border border-[#ede4d4] bg-black">
            <video ref={videoRef} className="h-full w-full scale-x-[-1] object-cover" playsInline muted />
            {!cameraReady ? (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                Starting camera…
              </p>
            ) : null}
          </div>
          {selfiePreview || todayRecord?.check_in_selfie_url ? (
            <div className="text-sm text-[#6b5d4d]">
              <p className="font-medium text-[#3d3428]">Last check-in photo</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selfiePreview ?? todayRecord?.check_in_selfie_url ?? ""}
                alt="Check-in selfie"
                className="mt-2 max-h-48 rounded-lg border border-[#ede4d4]"
              />
            </div>
          ) : null}
        </div>
      </article>

      <article className="rounded-2xl border border-[#ede4d4] bg-[#fffdf8] p-5">
        <div className="stat-cards-grid">
          <Info label="Name" value={displayName} />
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
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canCheckIn || busy !== "idle"}
            onClick={handleCheckIn}
            className="rounded-xl bg-[#c9a227] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b8921f] disabled:opacity-50"
          >
            {busy === "checkin" ? "Checking in…" : "Check In with Selfie"}
          </button>
          <button
            type="button"
            disabled={!canCheckOut || busy !== "idle"}
            onClick={() => setShowCheckoutForm((p) => !p)}
            className="rounded-xl border border-[#e8dcc8] bg-white px-4 py-2 text-sm font-semibold text-[#3d3428] hover:bg-[#faf6ee] disabled:opacity-50"
          >
            {showCheckoutForm ? "Hide check-out" : "Check Out"}
          </button>
        </div>
      </article>

      {showCheckoutForm ? (
        <article className="rounded-2xl border border-[#ede4d4] bg-white p-5">
          <h3 className="mb-3 text-lg font-semibold text-[#3d3428]">Work summary</h3>
          <div className="grid gap-3">
            {(["completedWork", "pendingWork", "challenges", "tomorrowPlan"] as const).map((key) => (
              <label key={key} className="block space-y-1">
                <span className="text-sm font-medium capitalize text-[#3d3428]">
                  {key.replace(/([A-Z])/g, " $1")}
                </span>
                <textarea
                  rows={2}
                  className="w-full rounded-xl border border-[#e8dcc8] px-3 py-2 text-sm"
                  value={checkoutForm[key]}
                  onChange={(e) => setCheckoutForm((p) => ({ ...p, [key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={handleCheckOut}
            disabled={!canCheckOut || busy === "checkout"}
            className="mt-4 rounded-xl bg-[#c9a227] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === "checkout" ? "Submitting…" : "Submit check-out"}
          </button>
        </article>
      ) : null}

      <article className="rounded-2xl border border-[#ede4d4] bg-white p-5">
        <h3 className="mb-3 text-lg font-semibold text-[#3d3428]">History (last 10)</h3>
        <div className="overflow-x-auto rounded-xl border border-[#ede4d4]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[#faf6ee] text-[#6b5d4d]">
              <tr>
                {["Date", "In", "Out", "Duration", "Status"].map((h) => (
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
