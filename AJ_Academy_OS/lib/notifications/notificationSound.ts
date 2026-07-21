export type NotificationSoundSettings = {
  enabled: boolean;
  volume: number;
};

const SETTINGS_KEY = "aj-academy-notification-sound";
const MUTE_UNTIL_KEY = "aj-academy-notification-mute-until";
const SOUND_CHANGE_EVENT = "aj-notification-sound-change";
const CHIME_URL = "/sounds/reminder-chime.wav";

const DEFAULT_SETTINGS: NotificationSoundSettings = {
  enabled: true,
  volume: 100,
};

let sharedCtx: AudioContext | null = null;
let chimeAudio: HTMLAudioElement | null = null;
let unlocked = false;
let lastPlayedAt = 0;

function notifyChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SOUND_CHANGE_EVENT));
  }
}

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

function getChimeAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!chimeAudio) {
    chimeAudio = new Audio(CHIME_URL);
    chimeAudio.preload = "auto";
  }
  return chimeAudio;
}

/** Call on first user gesture and when the dashboard loads so autoplay policies allow sound. */
export function unlockNotificationAudio(): void {
  if (typeof window === "undefined") return;
  unlocked = true;
  const ctx = getAudioCtx();
  if (ctx?.state === "suspended") void ctx.resume().catch(() => undefined);
  try {
    const a = getChimeAudio();
    if (a) {
      a.muted = true;
      const p = a.play();
      if (p) {
        void p
          .then(() => {
            a.pause();
            a.currentTime = 0;
            a.muted = false;
          })
          .catch(() => {
            a.muted = false;
          });
      }
    }
  } catch {
    /* ignore */
  }
}

export function subscribeNotificationSoundChange(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(SOUND_CHANGE_EVENT, handler);
  return () => window.removeEventListener(SOUND_CHANGE_EVENT, handler);
}

export function getNotificationSoundSettings(): NotificationSoundSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<NotificationSoundSettings>;
    return {
      enabled: parsed.enabled !== false,
      volume: Math.min(100, Math.max(0, Number(parsed.volume ?? DEFAULT_SETTINGS.volume))),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function setNotificationSoundSettings(patch: Partial<NotificationSoundSettings>) {
  if (typeof window === "undefined") return;
  const next = { ...getNotificationSoundSettings(), ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  notifyChange();
}

export function isNotificationSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  const settings = getNotificationSoundSettings();
  if (!settings.enabled || settings.volume <= 0) return true;
  const untilRaw = sessionStorage.getItem(MUTE_UNTIL_KEY);
  if (!untilRaw) return false;
  const until = Number(untilRaw);
  if (!Number.isFinite(until) || Date.now() >= until) {
    sessionStorage.removeItem(MUTE_UNTIL_KEY);
    return false;
  }
  return true;
}

export function muteNotificationSoundTemporarily(minutes = 30) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(MUTE_UNTIL_KEY, String(Date.now() + minutes * 60_000));
  notifyChange();
}

export function turnNotificationSoundOff() {
  setNotificationSoundSettings({ enabled: false });
}

export function turnNotificationSoundOn() {
  setNotificationSoundSettings({ enabled: true });
  if (typeof window !== "undefined") sessionStorage.removeItem(MUTE_UNTIL_KEY);
}

export function canPlayNotificationSound() {
  return !isNotificationSoundMuted();
}

function playToneFallback(volume: number): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const gain = ctx.createGain();
  gain.gain.value = Math.min(1, volume);
  gain.connect(ctx.destination);
  const tone = (freq: number, start: number, duration: number) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + duration);
  };
  tone(880, 0, 0.12);
  tone(1174.66, 0.13, 0.16);
}

/**
 * Play task / in-app notification chime. `force` bypasses mute (Test sound button).
 * Works best after unlockNotificationAudio() (dashboard login / first tap).
 */
export function playNotificationSound(force = false): void {
  if (typeof window === "undefined") return;
  if (!force && !canPlayNotificationSound()) return;

  const now = Date.now();
  if (!force && now - lastPlayedAt < 1500) return;
  lastPlayedAt = now;

  const volume = getNotificationSoundSettings().volume / 100;
  if (volume <= 0 && !force) return;

  unlockNotificationAudio();

  const audio = getChimeAudio();
  if (audio) {
    try {
      audio.muted = false;
      audio.volume = Math.min(1, force ? 1 : volume);
      audio.currentTime = 0;
      const played = audio.play();
      if (played) {
        void played.catch(() => playToneFallback(force ? 1 : volume));
        return;
      }
    } catch {
      /* fall through */
    }
  }

  playToneFallback(force ? 1 : volume);
}

/** Register global unlock on first interaction (safe to call once at app root). */
export function registerNotificationSoundUnlock(): () => void {
  if (typeof window === "undefined") return () => {};
  const unlock = () => unlockNotificationAudio();
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
  void unlock();
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}
