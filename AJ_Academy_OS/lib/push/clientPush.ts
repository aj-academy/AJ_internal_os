"use client";

import { getToken, deleteToken, onMessage, type Unsubscribe } from "firebase/messaging";
import {
  getFirebaseMessaging,
  getFirebaseVapidKey,
  type MessagingSupportResult,
} from "@/lib/firebase/client";

export type PushPermissionStatus =
  | "enabled"
  | "disabled"
  | "denied"
  | "default"
  | "unsupported"
  | "unconfigured"
  | "sw_unavailable"
  | "token_failed";

export type DeviceMeta = {
  deviceName?: string;
  platform?: string;
  browser?: string;
  userAgent?: string;
};

function detectDeviceMeta(): DeviceMeta {
  if (typeof navigator === "undefined") return {};
  const ua = navigator.userAgent || "";
  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  let platform = navigator.platform || "unknown";
  if (/Android/i.test(ua)) platform = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) platform = "iOS";
  else if (/Win/i.test(ua)) platform = "Windows";
  else if (/Mac/i.test(ua)) platform = "macOS";
  else if (/Linux/i.test(ua)) platform = "Linux";

  return {
    deviceName: `${browser} on ${platform}`,
    platform,
    browser,
    userAgent: ua.slice(0, 500),
  };
}

function maskToken(token: string): string {
  if (token.length <= 12) return "••••";
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    let registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) {
      registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    // Firebase getToken requires a ready/active registration
    const ready = await navigator.serviceWorker.ready;
    return ready;
  } catch {
    return null;
  }
}

export async function getPushSupportStatus(): Promise<PushPermissionStatus> {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  const messaging = await getFirebaseMessaging();
  if (!messaging.ok) {
    if (messaging.reason === "unconfigured") return "unconfigured";
    return "unsupported";
  }
  const perm = Notification.permission;
  if (perm === "denied") return "denied";
  if (perm === "default") return "default";
  return "enabled";
}

/** Obtain FCM token using active SW + VAPID (does not register to Supabase). */
export async function refreshFcmToken(): Promise<
  { ok: true; tokenHint: string; token: string } | { ok: false; error: string; status: PushPermissionStatus }
> {
  const messagingResult = await getFirebaseMessaging();
  if (!messagingResult.ok) {
    const status: PushPermissionStatus =
      messagingResult.reason === "unconfigured" ? "unconfigured" : "unsupported";
    return {
      ok: false,
      status,
      error: status === "unconfigured" ? "Firebase public env vars missing." : "Messaging unsupported.",
    };
  }
  const vapidKey = getFirebaseVapidKey();
  if (!vapidKey) {
    return { ok: false, status: "unconfigured", error: "NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing." };
  }
  const registration = await ensureServiceWorker();
  if (!registration) {
    return { ok: false, status: "sw_unavailable", error: "Service worker is not active." };
  }
  if (Notification.permission !== "granted") {
    return {
      ok: false,
      status: Notification.permission === "denied" ? "denied" : "default",
      error: "Notification permission is not granted.",
    };
  }
  try {
    const token = await getToken(messagingResult.messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { ok: false, status: "token_failed", error: "Empty FCM token." };
    return { ok: true, tokenHint: maskToken(token), token };
  } catch (e) {
    return {
      ok: false,
      status: "token_failed",
      error: e instanceof Error ? e.message : "getToken failed.",
    };
  }
}

/** Local browser notification via SW — no Firebase. */
export async function showLocalTestNotification(): Promise<{ ok: boolean; error?: string }> {
  const registration = await ensureServiceWorker();
  if (!registration) return { ok: false, error: "Service worker unavailable." };
  if (Notification.permission !== "granted") {
    return { ok: false, error: `Permission is "${Notification.permission}".` };
  }
  try {
    await registration.showNotification("AJ OS Local Test", {
      body: "The browser notification system is working.",
      icon: "/icons/icon-192x192.png?v=3",
      badge: "/icons/icon-192x192.png?v=3",
      silent: false,
      tag: "ajos-local-test",
      data: { url: "/employee/notifications" },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "showNotification failed." };
  }
}

export async function enablePushNotifications(opts?: {
  notificationsAfterLogout?: boolean;
}): Promise<{ ok: true; tokenPresent: boolean } | { ok: false; status: PushPermissionStatus; error: string }> {
  const messagingResult = await getFirebaseMessaging();
  if (!messagingResult.ok) {
    const status: PushPermissionStatus =
      messagingResult.reason === "unconfigured" ? "unconfigured" : "unsupported";
    return {
      ok: false,
      status,
      error:
        status === "unconfigured"
          ? "Firebase public env vars are not configured."
          : "This browser does not support web push.",
    };
  }

  const vapidKey = getFirebaseVapidKey();
  if (!vapidKey) {
    return { ok: false, status: "unconfigured", error: "NEXT_PUBLIC_FIREBASE_VAPID_KEY is missing." };
  }

  const registration = await ensureServiceWorker();
  if (!registration) {
    return { ok: false, status: "sw_unavailable", error: "Service worker could not be registered." };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return {
      ok: false,
      status: permission === "denied" ? "denied" : "default",
      error: "Notification permission was not granted.",
    };
  }

  let token: string;
  try {
    token = await getToken(messagingResult.messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
  } catch (e) {
    return {
      ok: false,
      status: "token_failed",
      error: e instanceof Error ? e.message : "Could not get FCM token.",
    };
  }

  if (!token) {
    return { ok: false, status: "token_failed", error: "Empty FCM token returned." };
  }

  const meta = detectDeviceMeta();
  const res = await fetch("/api/push/register", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fcmToken: token,
      ...meta,
      notificationsAfterLogout: opts?.notificationsAfterLogout !== false,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    return { ok: false, status: "token_failed", error: json.error || "Device registration failed." };
  }

  try {
    sessionStorage.setItem("ajos_fcm_token_present", "1");
  } catch {
    /* ignore */
  }

  return { ok: true, tokenPresent: true };
}

/** Disable push on this device only. Call while still authenticated. */
export async function disablePushOnThisDevice(reason = "user_disabled"): Promise<{ ok: boolean; error?: string }> {
  const messagingResult = await getFirebaseMessaging();
  let token: string | null = null;
  if (messagingResult.ok) {
    try {
      const vapidKey = getFirebaseVapidKey();
      const registration = await ensureServiceWorker();
      if (vapidKey && registration) {
        token = await getToken(messagingResult.messaging, {
          vapidKey,
          serviceWorkerRegistration: registration,
        });
      }
    } catch {
      /* continue without token */
    }
  }

  if (token) {
    const res = await fetch("/api/push/unregister", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken: token, reason }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: json.error || "Unregister failed." };
    }
    try {
      if (messagingResult.ok) {
        await deleteToken(messagingResult.messaging);
      }
    } catch {
      /* optional */
    }
  }

  try {
    sessionStorage.removeItem("ajos_fcm_token_present");
  } catch {
    /* ignore */
  }
  return { ok: true };
}

export async function sendTestPush(): Promise<{ ok: boolean; error?: string; detail?: unknown }> {
  const res = await fetch("/api/push/test", { method: "POST", credentials: "include" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: (json as { error?: string }).error || "Test push failed.", detail: json };
  }
  return { ok: true, detail: json };
}

export async function sendDebugPush(allDevices = true): Promise<{ ok: boolean; error?: string; detail?: unknown }> {
  const res = await fetch("/api/push/debug-send", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allDevices }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    succeeded?: number;
    failed?: number;
    results?: unknown;
  };
  if (!res.ok) {
    return {
      ok: false,
      error: json.error || `Debug send HTTP ${res.status}`,
      detail: json,
    };
  }
  if (json.ok === false) {
    const first = Array.isArray(json.results) ? (json.results[0] as { errorCode?: string; errorMessage?: string }) : null;
    const hint = first?.errorCode || first?.errorMessage || json.error || "Firebase send returned 0 successes";
    return { ok: false, error: hint, detail: json };
  }
  return { ok: true, detail: json };
}

/**
 * Foreground FCM listener.
 * Shows in-app toast via callback; optionally also shows a system notification
 * when NEXT_PUBLIC_SHOW_SYSTEM_NOTIFICATION_IN_FOREGROUND !== "false".
 */
export async function subscribeForegroundMessages(
  onPayload: (payload: { title: string; body: string; url: string }) => void,
): Promise<Unsubscribe | null> {
  const messagingResult = await getFirebaseMessaging();
  if (!messagingResult.ok) return null;
  const showSystem =
    typeof process.env.NEXT_PUBLIC_SHOW_SYSTEM_NOTIFICATION_IN_FOREGROUND === "undefined" ||
    process.env.NEXT_PUBLIC_SHOW_SYSTEM_NOTIFICATION_IN_FOREGROUND !== "false";

  return onMessage(messagingResult.messaging, (payload) => {
    const data = payload.data || {};
    const title = data.title || payload.notification?.title || "AJ OS";
    const body = data.body || payload.notification?.body || "";
    const url = data.targetUrl || data.url || "/employee/notifications";
    console.info("[AJOS FCM] Foreground message received");
    onPayload({ title, body, url });

    // Hidden/background tab: still show a system notification (do not rely on refresh).
    const mustShowSystem =
      showSystem ||
      (typeof document !== "undefined" && document.visibilityState !== "visible");

    if (mustShowSystem && typeof Notification !== "undefined" && Notification.permission === "granted") {
      void navigator.serviceWorker.ready
        .then((reg) =>
          reg.showNotification(title, {
            body: body || "You have a new notification.",
            icon: "/icons/icon-192x192.png?v=3",
            badge: "/icons/icon-192x192.png?v=3",
            silent: false,
            tag: String(data.notificationId || data.type || `ajos-fg-${Date.now()}`).slice(0, 64),
            data: { url, targetUrl: url },
            // SW NotificationOptions — not all fields are in TS DOM typings
            ...({ renotify: true, requireInteraction: true } as NotificationOptions),
          }),
        )
        .catch(() => {
          /* ignore */
        });
    }
  });
}

export type { MessagingSupportResult };
