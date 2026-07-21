"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeForegroundMessages } from "@/lib/push/clientPush";
import { onForegroundPushAlert } from "@/components/notifications/NotificationPresence";
import { safeRelativePath } from "@/lib/security/safeRedirect";

type Toast = { title: string; body: string; url: string };

/**
 * Foreground FCM — in-app toast only (no second browser notification).
 * Relies on Supabase Realtime / bell for unread count when a row is inserted.
 */
export function ForegroundPushListener() {
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const result = await subscribeForegroundMessages((payload) => {
        if (cancelled) return;
        onForegroundPushAlert();
        setToast({
          title: payload.title || "AJ OS",
          body: payload.body || "",
          url: safeRelativePath(payload.url) || "/employee/dashboard",
        });
      });
      if (cancelled) {
        result?.();
        return;
      }
      unsub = result;
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <button
      type="button"
      role="status"
      onClick={() => {
        const path = safeRelativePath(toast.url) || "/employee/dashboard";
        setToast(null);
        router.push(path);
      }}
      className="fixed bottom-20 left-1/2 z-[210] w-[min(100vw-2rem,24rem)] -translate-x-1/2 rounded-xl border border-[#c9a227]/40 bg-[#fffdf8] px-4 py-3 text-left shadow-lg sm:bottom-6"
    >
      <p className="text-sm font-semibold text-[#3d3428]">{toast.title}</p>
      {toast.body ? <p className="mt-0.5 text-xs text-[#6b5d4d]">{toast.body}</p> : null}
      <p className="mt-1 text-[10px] font-medium text-[#a68b2e]">Tap to open</p>
    </button>
  );
}
