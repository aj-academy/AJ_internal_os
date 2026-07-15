/** Reminder sound — separate from generic in-app notification settings. */

const TAB_LOCK_KEY = "aj-reminder-sound-lock";
const PLAYED_KEY = "aj-reminder-sound-played";

export function unlockReminderAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  try {
    const audio = new Audio("/sounds/reminder-chime.wav");
    audio.preload = "auto";
    audio.volume = 0.01;
    void audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
    }).catch(() => undefined);
    return audio;
  } catch {
    return null;
  }
}

function wasPlayed(notificationId: string): boolean {
  try {
    const raw = sessionStorage.getItem(PLAYED_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    return Boolean(map[notificationId]);
  } catch {
    return false;
  }
}

function markPlayed(notificationId: string) {
  try {
    const raw = sessionStorage.getItem(PLAYED_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[notificationId] = Date.now();
    const entries = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80);
    sessionStorage.setItem(PLAYED_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* ignore */
  }
}

/** Cross-tab lock so only one tab plays the chime */
function acquireTabLock(notificationId: string): boolean {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(TAB_LOCK_KEY);
    const lock = raw ? (JSON.parse(raw) as { id: string; at: number; tab: string }) : null;
    const tab = sessionStorage.getItem("aj-reminder-tab-id") || (() => {
      const id = `t-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem("aj-reminder-tab-id", id);
      return id;
    })();
    if (lock && lock.id === notificationId && now - lock.at < 8000 && lock.tab !== tab) {
      return false;
    }
    localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({ id: notificationId, at: now, tab }));
    return true;
  } catch {
    return true;
  }
}

export function playReminderChimeOnce(opts: {
  notificationId: string;
  volume?: number;
  enabled?: boolean;
}): void {
  if (typeof window === "undefined") return;
  if (opts.enabled === false) return;
  if (wasPlayed(opts.notificationId)) return;
  if (!acquireTabLock(opts.notificationId)) return;
  markPlayed(opts.notificationId);
  try {
    const audio = new Audio("/sounds/reminder-chime.wav");
    audio.volume = Math.min(1, Math.max(0, (opts.volume ?? 80) / 100));
    void audio.play().catch(() => undefined);
  } catch {
    /* browser blocked until gesture */
  }
}

export function isInQuietHours(
  start: string | null | undefined,
  end: string | null | undefined,
  now = new Date(),
): boolean {
  if (!start || !end) return false;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const cur = `${hh}:${mm}`;
  const s = start.slice(0, 5);
  const e = end.slice(0, 5);
  if (s <= e) return cur >= s && cur < e;
  return cur >= s || cur < e;
}
