/** Reminder ring — Web Audio (no asset file). Separate from in-app task bell. */

const TAB_LOCK_KEY = "aj-reminder-sound-lock";
const PLAYED_KEY = "aj-reminder-sound-played";

/** Continuous ring duration (ms) */
export const REMINDER_RING_DURATION_MS = 60_000;
/** Gap between ding-dong pairs while ringing */
const RING_INTERVAL_MS = 1_800;

let sharedCtx: AudioContext | null = null;
let ringTimer: ReturnType<typeof setInterval> | null = null;
let ringDeadline = 0;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedCtx || sharedCtx.state === "closed") sharedCtx = new AudioCtx();
    return sharedCtx;
  } catch {
    return null;
  }
}

/** Unlock autoplay after first user gesture */
export function unlockReminderAudio(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
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

function acquireTabLock(notificationId: string): boolean {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(TAB_LOCK_KEY);
    const lock = raw ? (JSON.parse(raw) as { id: string; at: number; tab: string }) : null;
    const tab =
      sessionStorage.getItem("aj-reminder-tab-id") ||
      (() => {
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

function playChimeTones(volume: number): boolean {
  const ctx = getAudioCtx();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    const gain = ctx.createGain();
    gain.gain.value = Math.min(1, Math.max(0, volume));
    gain.connect(ctx.destination);

    const tone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };

    tone(988, 0, 0.14);
    tone(1318.5, 0.16, 0.22);
    return true;
  } catch {
    return false;
  }
}

/** Stop any continuous reminder ring immediately */
export function stopReminderRing(): void {
  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
  ringDeadline = 0;
}

/**
 * Continuous ring for up to 1 minute (ding-dong every ~1.8s).
 * Call stopReminderRing() on snooze / dismiss / complete.
 */
export function playReminderChimeOnce(opts: {
  notificationId: string;
  volume?: number;
  enabled?: boolean;
  /** Override duration for Test sound (default 60s) */
  durationMs?: number;
}): boolean {
  if (typeof window === "undefined") return false;
  if (opts.enabled === false) return false;
  if (wasPlayed(opts.notificationId)) return false;
  if (!acquireTabLock(opts.notificationId)) return false;

  const volume = Math.min(1, Math.max(0, (opts.volume ?? 80) / 100));
  if (volume <= 0) return false;

  stopReminderRing();

  const ok = playChimeTones(volume);
  if (!ok) return false;

  markPlayed(opts.notificationId);
  const duration = opts.durationMs ?? REMINDER_RING_DURATION_MS;
  ringDeadline = Date.now() + duration;

  ringTimer = setInterval(() => {
    if (Date.now() >= ringDeadline) {
      stopReminderRing();
      return;
    }
    playChimeTones(volume);
  }, RING_INTERVAL_MS);

  return true;
}

export function isReminderRinging(): boolean {
  return ringTimer != null;
}

export function showReminderBrowserNotification(opts: {
  title: string;
  body?: string | null;
  tag?: string;
  linkPath?: string | null;
}): void {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(opts.title, {
      body: opts.body || "Reminder due",
      tag: opts.tag || "aj-reminder",
      silent: false,
    });
    n.onclick = () => {
      window.focus();
      if (opts.linkPath) window.location.href = opts.linkPath;
      n.close();
    };
  } catch {
    /* ignore */
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

export function isReminderSnoozed(snoozeUntil: string | null | undefined, now = new Date()): boolean {
  if (!snoozeUntil) return false;
  return new Date(snoozeUntil).getTime() > now.getTime();
}
