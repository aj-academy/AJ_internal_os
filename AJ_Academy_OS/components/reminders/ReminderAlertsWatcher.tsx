"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReminderNotificationRow, ReminderUserSettings } from "@/types/reminders";
import {
  isInQuietHours,
  isReminderSnoozed,
  playReminderChimeOnce,
  showReminderBrowserNotification,
  stopReminderRing,
  unlockReminderAudio,
} from "@/lib/reminders/reminderSound";

const POLL_MS = 15_000;
const BROWSER_SHOWN_KEY = "aj-reminder-browser-shown";

function wasBrowserShown(id: string): boolean {
  try {
    const raw = sessionStorage.getItem(BROWSER_SHOWN_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    return Boolean(map[id]);
  } catch {
    return false;
  }
}

function markBrowserShown(id: string) {
  try {
    const raw = sessionStorage.getItem(BROWSER_SHOWN_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[id] = Date.now();
    sessionStorage.setItem(
      BROWSER_SHOWN_KEY,
      JSON.stringify(Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 80))),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Global reminder due watcher — popup + continuous 1‑minute ring + browser
 * notification while staff is signed in on any admin/employee page.
 */
export function ReminderAlertsWatcher() {
  const [settings, setSettings] = useState<ReminderUserSettings | null>(null);
  const [due, setDue] = useState<ReminderNotificationRow[]>([]);
  const handledSound = useRef<Set<string>>(new Set());
  const busy = useRef(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders/settings");
      if (!res.ok) return;
      const json = (await res.json()) as { settings?: ReminderUserSettings };
      if (json.settings) setSettings(json.settings);
    } catch {
      /* ignore */
    }
  }, []);

  const loadDue = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders/notifications");
      if (!res.ok) return;
      const json = (await res.json()) as { notifications?: ReminderNotificationRow[]; schemaMissing?: boolean };
      if (json.schemaMissing) {
        setDue([]);
        return;
      }
      setDue(json.notifications ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadDue();
    const unlock = () => unlockReminderAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    const t = setInterval(() => void loadDue(), POLL_MS);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      clearInterval(t);
      stopReminderRing();
    };
  }, [loadSettings, loadDue]);

  const top = due.find((n) => {
    if (n.reminder && (n.reminder.status === "Completed" || n.reminder.status === "Cancelled")) return false;
    if (isReminderSnoozed(n.reminder?.snooze_until)) return false;
    return true;
  });

  const quiet =
    settings && isInQuietHours(settings.quiet_hours_start, settings.quiet_hours_end);

  useEffect(() => {
    if (!top || !settings || quiet) {
      if (!top) stopReminderRing();
      return;
    }

    if (settings.sound_enabled && top.reminder?.sound_enabled !== false && !handledSound.current.has(top.id)) {
      const played = playReminderChimeOnce({
        notificationId: top.id,
        volume: settings.sound_volume,
        enabled: true,
      });
      if (played) {
        handledSound.current.add(top.id);
        void fetch("/api/reminders/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: top.id, action: "sound_played" }),
        });
      }
    }

    if (
      settings.browser_notification_enabled &&
      !wasBrowserShown(top.id) &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      showReminderBrowserNotification({
        title: top.title || "Reminder due",
        body: top.body,
        tag: top.id,
        linkPath: top.link_path || (top.reminder_id ? `/employee/reminders?open=${top.reminder_id}` : null),
      });
      markBrowserShown(top.id);
    }
  }, [top, settings, quiet]);

  const dismiss = async () => {
    if (!top || busy.current) return;
    busy.current = true;
    stopReminderRing();
    try {
      await fetch("/api/reminders/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: top.id, action: "dismiss" }),
      });
      setDue((prev) => prev.filter((n) => n.id !== top.id));
      await loadDue();
    } finally {
      busy.current = false;
    }
  };

  const complete = async () => {
    if (!top || busy.current) return;
    busy.current = true;
    stopReminderRing();
    try {
      await fetch(`/api/reminders/${top.reminder_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      setDue((prev) => prev.filter((n) => n.reminder_id !== top.reminder_id));
      await loadDue();
    } finally {
      busy.current = false;
    }
  };

  const snooze = async (minutes: number) => {
    if (!top || busy.current) return;
    busy.current = true;
    stopReminderRing();
    // Optimistic hide so popup vanishes immediately
    setDue((prev) => prev.filter((n) => n.reminder_id !== top.reminder_id));
    try {
      await fetch(`/api/reminders/${top.reminder_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snooze", snooze_minutes: minutes }),
      });
      await loadDue();
    } finally {
      busy.current = false;
    }
  };

  if (!top || quiet || settings?.popup_enabled === false) return null;

  const href =
    top.link_path ||
    (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")
      ? `/admin/reminders?open=${top.reminder_id}`
      : `/employee/reminders?open=${top.reminder_id}`);

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[min(100vw-1.5rem,24rem)] rounded-2xl border border-[#e8dcc8] bg-white p-4 shadow-2xl">
      <div className="flex items-start gap-2">
        <Bell className="mt-0.5 h-5 w-5 text-[#c9a227]" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase text-[#94a3b8]">Reminder due</p>
          <p className="font-semibold text-[#0f172a]">{top.title}</p>
          <p className="text-xs text-[#64748b]">{top.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => { window.location.href = href; }}>
              View
            </Button>
            {[5, 10, 15, 30].map((m) => (
              <Button key={m} size="sm" variant="outline" className="rounded-full" onClick={() => void snooze(m)}>
                Snooze {m}m
              </Button>
            ))}
            <Button size="sm" className="rounded-full bg-emerald-600 text-white" onClick={() => void complete()}>
              Complete
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => void dismiss()}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
