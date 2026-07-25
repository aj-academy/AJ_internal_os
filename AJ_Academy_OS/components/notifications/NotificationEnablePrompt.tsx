"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  enablePushNotifications,
  getPushSupportStatus,
  type PushPermissionStatus,
} from "@/lib/push/clientPush";
import {
  playNotificationSound,
  unlockNotificationAudio,
} from "@/lib/notifications/notificationSound";
import {
  iosNeedsHomeScreenForPush,
  isMobileUa,
  isThisDevicePushRegistered,
  markThisDevicePushRegistered,
} from "@/lib/push/mobilePush";

const DISMISS_KEY = "ajos-notif-enable-dismissed-v2";

/**
 * Phone and laptop each need their own FCM registration.
 * Laptop working does NOT mean the phone will get alerts until this device is enabled.
 */
export function NotificationEnablePrompt() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PushPermissionStatus | null>(null);
  const [iosInstallOnly, setIosInstallOnly] = useState(false);
  const [compactBanner, setCompactBanner] = useState(false);

  const trySilentRegister = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    if (Notification.permission !== "granted") return false;
    const result = await enablePushNotifications({ notificationsAfterLogout: true });
    if (result.ok) {
      markThisDevicePushRegistered();
      unlockNotificationAudio();
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (iosNeedsHomeScreenForPush()) {
        if (cancelled) return;
        setIosInstallOnly(true);
        setStatus("unsupported");
        try {
          if (localStorage.getItem(DISMISS_KEY) === "1" && !isMobileUa()) return;
        } catch {
          /* ignore */
        }
        // Always show guidance on iOS Safari tabs until installed
        setOpen(true);
        return;
      }

      const s = await getPushSupportStatus();
      if (cancelled) return;
      setStatus(s);

      if (s === "enabled") {
        const ok = await trySilentRegister();
        if (ok || isThisDevicePushRegistered()) return;
        // Permission granted but this phone never stored a token successfully
        setCompactBanner(true);
        setOpen(true);
        return;
      }

      if (s === "denied") {
        setCompactBanner(true);
        setOpen(true);
        return;
      }

      if (s === "unsupported" || s === "unconfigured" || s === "sw_unavailable") {
        setCompactBanner(true);
        setOpen(true);
        return;
      }

      if (s !== "default") return;

      // Re-prompt on mobile even if previously dismissed — laptop enable does not cover phone
      try {
        if (!isMobileUa() && localStorage.getItem(DISMISS_KEY) === "1") return;
        if (isMobileUa() && localStorage.getItem(DISMISS_KEY) === "1" && isThisDevicePushRegistered()) return;
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

    if (iosNeedsHomeScreenForPush()) {
      setError("On iPhone: tap Share → Add to Home Screen, open AJ OS from the home icon, then Enable again.");
      setBusy(false);
      return;
    }

    const result = await enablePushNotifications({ notificationsAfterLogout: true });
    if (result.ok) {
      markThisDevicePushRegistered();
      playNotificationSound(true);
      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {
        /* ignore */
      }
      setCompactBanner(false);
      setOpen(false);
    } else {
      setError(result.error || "Could not enable notifications on this phone.");
      setStatus(result.status);
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
    // Keep a small banner on mobile so they can retry
    if (isMobileUa() && !isThisDevicePushRegistered()) {
      setCompactBanner(true);
    }
  };

  if (!open && compactBanner && isMobileUa() && !isThisDevicePushRegistered()) {
    return (
      <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[80] rounded-2xl border border-[#c9a227]/50 bg-[#fffdf8] p-3 shadow-lg sm:hidden">
        <p className="text-sm font-semibold text-[#3d3428]">Phone alerts are off</p>
        <p className="mt-0.5 text-xs text-[#6b5d4d]">
          Your laptop is enabled separately. Tap Enable on this phone to get task sound + notifications here.
        </p>
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            className="h-9 flex-1 rounded-full bg-[#2563eb] text-white"
            onClick={() => {
              setCompactBanner(false);
              setOpen(true);
            }}
          >
            Enable on this phone
          </Button>
          <Button type="button" variant="outline" className="h-9 rounded-full" onClick={() => setCompactBanner(false)}>
            Later
          </Button>
        </div>
      </div>
    );
  }

  if (!open) return null;

  const title = iosInstallOnly
    ? "Install AJ OS on iPhone first"
    : status === "denied"
      ? "Notifications blocked on this phone"
      : "Turn on alerts on this phone";

  const body = iosInstallOnly
    ? "iPhone only sends push alerts from the installed Home Screen app — not from a normal Safari tab. Add AJ OS to Home Screen, open it, then enable notifications."
    : status === "denied"
      ? "Open phone Settings → Notifications → Chrome / AJ Academy OS → Allow. Then return here and tap Enable."
      : isMobileUa()
        ? "Your laptop already works. This phone needs its own permission + device registration for sound and task alerts."
        : "Enable notifications so you hear a sound and see alerts when a task is assigned — even if AJ OS is minimized.";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 p-3 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-labelledby="notif-enable-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[#d4deea] bg-white p-5 shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#eff6ff] text-[#2563eb]">
          {iosInstallOnly ? <Share className="h-6 w-6" /> : <Bell className="h-6 w-6" />}
        </div>
        <p id="notif-enable-title" className="mt-3 text-center text-lg font-semibold text-[#0f172a]">
          {title}
        </p>
        <p className="mt-1 text-center text-sm text-[#64748b]">{body}</p>
        {iosInstallOnly ? (
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-left text-xs text-[#475569]">
            <li>Tap the Share button in Safari</li>
            <li>Choose Add to Home Screen</li>
            <li>Open AJ OS from the new home icon</li>
            <li>Tap Enable notifications below</li>
          </ol>
        ) : null}
        {error ? <p className="mt-2 text-center text-xs font-medium text-rose-600">{error}</p> : null}
        <div className="mt-4 flex flex-col gap-2">
          <Button
            type="button"
            disabled={busy}
            className="h-11 rounded-full bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
            onClick={() => void onEnable()}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
            {iosInstallOnly ? "I installed it — Enable now" : "Enable notifications"}
          </Button>
          <Button type="button" variant="outline" disabled={busy} className="h-10 rounded-full border-[#d4deea]" onClick={onDismiss}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
