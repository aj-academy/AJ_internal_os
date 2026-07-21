"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  enablePushNotifications,
  getPushSupportStatus,
} from "@/lib/push/clientPush";
import {
  playNotificationSound,
  unlockNotificationAudio,
} from "@/lib/notifications/notificationSound";

const DISMISS_KEY = "ajos-notif-enable-dismissed-v1";

/**
 * Ensures FCM is registered after login.
 * - If browser permission already granted → silent re-register (no dialog).
 * - If permission never asked → one-time prompt (Enable / Not now).
 * Clicking Enable also unlocks notification audio for in-app chimes.
 */
export function NotificationEnablePrompt() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trySilentRegister = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    await enablePushNotifications({ notificationsAfterLogout: true });
    unlockNotificationAudio();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await getPushSupportStatus();
      if (cancelled) return;

      if (status === "enabled") {
        void trySilentRegister();
        return;
      }

      if (status !== "default") return;

      try {
        if (localStorage.getItem(DISMISS_KEY) === "1") return;
      } catch {
        /* ignore */
      }
      setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [trySilentRegister]);

  const onEnable = async () => {
    setBusy(true);
    setError(null);
    unlockNotificationAudio();
    const result = await enablePushNotifications({ notificationsAfterLogout: true });
    if (result.ok) {
      playNotificationSound(true);
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {
        /* ignore */
      }
      setOpen(false);
    } else {
      setError(result.error || "Could not enable notifications.");
    }
    setBusy(false);
  };

  const onDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-labelledby="notif-enable-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[#d4deea] bg-white p-5 shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#eff6ff] text-[#2563eb]">
          <Bell className="h-6 w-6" />
        </div>
        <p id="notif-enable-title" className="mt-3 text-center text-lg font-semibold text-[#0f172a]">
          Turn on task alerts
        </p>
        <p className="mt-1 text-center text-sm text-[#64748b]">
          Enable notifications so you hear a sound and see alerts when a task is assigned — even if AJ OS is minimized.
        </p>
        {error ? <p className="mt-2 text-center text-xs font-medium text-rose-600">{error}</p> : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            type="button"
            disabled={busy}
            className="rounded-full bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
            onClick={() => void onEnable()}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
            Enable notifications
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            className="rounded-full border-[#d4deea]"
            onClick={onDismiss}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
