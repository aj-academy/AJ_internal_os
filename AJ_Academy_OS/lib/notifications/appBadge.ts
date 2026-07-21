/** PWA taskbar / dock badge (1, 2, 3…) — Chromium PWAs on Windows, macOS, Android. */

export function isAppBadgeSupported(): boolean {
  return typeof navigator !== "undefined" && "setAppBadge" in navigator;
}

export async function setNotificationBadge(count: number): Promise<void> {
  if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
  try {
    const n = Math.max(0, Math.floor(count));
    if (n <= 0) {
      await navigator.clearAppBadge?.();
    } else {
      await navigator.setAppBadge(n);
    }
    syncBadgeToServiceWorker(n);
  } catch {
    /* unsupported or denied */
  }
}

export async function clearNotificationBadge(): Promise<void> {
  await setNotificationBadge(0);
}

/** Tell the active service worker the authoritative unread count (overrides SW increments). */
export function syncBadgeToServiceWorker(count: number): void {
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller) return;
  try {
    navigator.serviceWorker.controller.postMessage({
      type: "BADGE_SYNC",
      count: Math.max(0, Math.floor(count)),
    });
  } catch {
    /* ignore */
  }
}
