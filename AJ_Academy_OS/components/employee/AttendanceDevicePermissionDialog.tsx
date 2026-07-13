"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const STORAGE_PREFIX = "aj-academy-attendance-device-perms-v1:";

export function attendanceDevicePermsKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function hasSavedAttendanceDevicePerms(userId: string) {
  if (typeof window === "undefined" || !userId) return false;
  try {
    return localStorage.getItem(attendanceDevicePermsKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markAttendanceDevicePermsSaved(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(attendanceDevicePermsKey(userId), "1");
  } catch {
    /* ignore quota / private mode */
  }
}

async function requestCameraAccess() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false,
  });
  stream.getTracks().forEach((t) => t.stop());
}

async function requestLocationAccess() {
  await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("Location permission was denied.")), {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
}

/**
 * First-login (per browser) popup: ask for camera + location once for attendance.
 * Browser stores the actual permission; we store that onboarding completed in localStorage.
 */
export function AttendanceDevicePermissionDialog() {
  const supabase = createClient();
  const [userId, setUserId] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOk, setCameraOk] = useState(false);
  const [locationOk, setLocationOk] = useState(false);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;
      setUserId(user.id);
      if (!hasSavedAttendanceDevicePerms(user.id)) setOpen(true);
    })();
  }, [supabase]);

  const enableBoth = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    let cam = false;
    let loc = false;
    try {
      await requestCameraAccess();
      cam = true;
      setCameraOk(true);
    } catch {
      setCameraOk(false);
    }
    try {
      await requestLocationAccess();
      loc = true;
      setLocationOk(true);
    } catch {
      setLocationOk(false);
    }

    if (cam && loc) {
      markAttendanceDevicePermsSaved(userId);
      setOpen(false);
    } else {
      setError(
        !cam && !loc
          ? "Camera and location were blocked. Allow both in your browser settings, then try again."
          : !cam
            ? "Camera was blocked. Allow camera access, then try again."
            : "Location was blocked. Allow location access, then try again.",
      );
    }
    setBusy(false);
  }, [userId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-device-perms-title"
        className="w-full max-w-md rounded-2xl border border-[#e8dcc8] bg-white p-6 shadow-xl"
      >
        <h2 id="attendance-device-perms-title" className="text-lg font-semibold text-[#0f172a]">
          Enable attendance permissions
        </h2>
        <p className="mt-2 text-sm text-[#64748b]">
          Attendance check-in needs your <strong>camera</strong> (selfie) and <strong>location</strong>. Allow both now —
          your browser will remember this for next time on this device.
        </p>

        <ul className="mt-4 space-y-2 text-sm text-[#334155]">
          <li className="flex items-center gap-2">
            <Camera className={`h-4 w-4 ${cameraOk ? "text-emerald-600" : "text-[#c9a227]"}`} />
            Camera {cameraOk ? "— allowed" : "— required for selfie check-in"}
          </li>
          <li className="flex items-center gap-2">
            <MapPin className={`h-4 w-4 ${locationOk ? "text-emerald-600" : "text-[#c9a227]"}`} />
            Location {locationOk ? "— allowed" : "— required for check-in / check-out"}
          </li>
        </ul>

        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" disabled={busy} onClick={() => void enableBoth()}>
            {busy ? "Requesting…" : "Allow camera & location"}
          </Button>
        </div>
      </div>
    </div>
  );
}
