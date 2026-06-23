export type NotificationSoundSettings = {
  enabled: boolean;
  volume: number;
};

const SETTINGS_KEY = "aj-academy-notification-sound";
const MUTE_UNTIL_KEY = "aj-academy-notification-mute-until";
const SOUND_CHANGE_EVENT = "aj-notification-sound-change";

const DEFAULT_SETTINGS: NotificationSoundSettings = {
  enabled: true,
  volume: 100,
};

function notifyChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SOUND_CHANGE_EVENT));
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

export function playNotificationSound(force = false) {
  if (typeof window === "undefined") return;
  if (!force && !canPlayNotificationSound()) return;

  const volume = getNotificationSoundSettings().volume / 100;
  if (volume <= 0) return;

  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.gain.value = Math.min(1, volume);
    gain.connect(ctx.destination);

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + duration);
    };

    playTone(880, ctx.currentTime, 0.12);
    playTone(1174.66, ctx.currentTime + 0.13, 0.16);
    window.setTimeout(() => void ctx.close(), 500);
  } catch {
    /* ignore autoplay / audio errors */
  }
}
