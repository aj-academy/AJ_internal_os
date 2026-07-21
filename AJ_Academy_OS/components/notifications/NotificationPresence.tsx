"use client";

import { useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { setNotificationBadge, syncBadgeToServiceWorker } from "@/lib/notifications/appBadge";
import {
  playNotificationSound,
  registerNotificationSoundUnlock,
  unlockNotificationAudio,
} from "@/lib/notifications/notificationSound";

/**
 * Keeps PWA app-icon badge in sync and unlocks notification audio after login.
 * Sound + badge also update via InAppNotificationsBell / FCM listeners.
 */
export function NotificationPresence() {
  const syncUnreadBadge = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      await setNotificationBadge(0);
      return;
    }
    const { count, error } = await supabase
      .from("in_app_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .is("read_at", null);
    if (error) return;
    const n = count ?? 0;
    await setNotificationBadge(n);
    syncBadgeToServiceWorker(n);
  }, []);

  useEffect(() => {
    const teardownUnlock = registerNotificationSoundUnlock();
    void syncUnreadBadge();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        unlockNotificationAudio();
        void syncUnreadBadge();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;

      channel = supabase
        .channel("notification-presence-badge")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "in_app_notifications",
            filter: `user_id=eq.${uid}`,
          },
          () => {
            void syncUnreadBadge();
          },
        )
        .subscribe();
    })();

    return () => {
      teardownUnlock();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [syncUnreadBadge]);

  return null;
}

/** Play chime when a push payload arrives in the foreground (task assigned, etc.). */
export function onForegroundPushAlert(): void {
  unlockNotificationAudio();
  playNotificationSound();
}
