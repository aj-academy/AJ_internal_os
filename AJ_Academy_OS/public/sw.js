/* AJ Academy — PWA service worker + FCM background handler (single root worker) */
const CACHE_VERSION = "aj-academy-v9-notify-badge";
const ICON_QUERY = "?v=3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ICON_URL = `/icons/icon-192x192.png${ICON_QUERY}`;
const BADGE_URL = ICON_URL; // badge-72 not shipped; reuse 192

const PRECACHE_URLS = [
  "/offline.html",
  ICON_URL,
  `/icons/icon-512x512.png${ICON_QUERY}`,
  `/icons/maskable-icon-512x512.png${ICON_QUERY}`,
  `/apple-touch-icon.png${ICON_QUERY}`,
  `/favicon.ico${ICON_QUERY}`,
];

/** Always log FCM lifecycle (no tokens / secrets). */
function fcmLog(...args) {
  try {
    console.log("[AJOS SW]", ...args);
  } catch {
    /* ignore */
  }
}

function isSafeInternalUrl(url) {
  if (typeof url !== "string") return false;
  const t = url.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return false;
  if (/^[a-z]+:/i.test(t)) return false;
  if (t.includes("\\")) return false;
  return true;
}

const recentFcmTags = new Set();
let badgeCount = 0;

function isBadgeApiAvailable() {
  return typeof self.navigator !== "undefined" && "setAppBadge" in self.navigator;
}

async function applyAppBadge(count) {
  if (!isBadgeApiAvailable()) return;
  const n = Math.max(0, Math.floor(count));
  try {
    if (n <= 0) {
      await self.navigator.clearAppBadge?.();
    } else {
      await self.navigator.setAppBadge(n);
    }
  } catch {
    /* unsupported */
  }
}

async function incrementAppBadge() {
  badgeCount += 1;
  await applyAppBadge(badgeCount);
}

/**
 * Show one system notification per notificationId/tag (prevents push + onBackgroundMessage duplicates).
 */
function showFcmSystemNotification(data, fallbackTitle) {
  const title = data.title || fallbackTitle || "AJ OS";
  const body = data.body || data.message || "You have a new notification.";
  const rawUrl = data.targetUrl || data.url || "/employee/notifications";
  const url = isSafeInternalUrl(rawUrl) ? rawUrl : "/employee/notifications";
  const tag = String(data.notificationId || data.tag || `aj-os-${Date.now()}`).slice(0, 64);

  if (recentFcmTags.has(tag)) {
    fcmLog("showNotification skipped (duplicate tag)", tag);
    return Promise.resolve();
  }
  recentFcmTags.add(tag);
  setTimeout(() => recentFcmTags.delete(tag), 60_000);

  fcmLog("showNotification called", { title, tag, url });
  return self.registration
    .showNotification(title, {
      body,
      icon: ICON_URL,
      badge: BADGE_URL,
      silent: false,
      renotify: true,
      requireInteraction: true,
      tag,
      data: {
        url,
        targetUrl: url,
        notificationId: data.notificationId || "",
        type: data.type || "",
        source: data.source || "ajos-fcm",
      },
    })
    .then(() => {
      fcmLog("notification displayed", tag);
      return incrementAppBadge();
    });
}

function extractFcmData(raw) {
  if (!raw || typeof raw !== "object") return null;
  // FCM web push often nests fields under data
  const nested = raw.data && typeof raw.data === "object" ? raw.data : null;
  const data = nested ? { ...raw, ...nested } : { ...raw };
  const isFcm =
    Boolean(raw.from) ||
    Boolean(raw.fcmMessageId) ||
    data.source === "ajos-fcm" ||
    Boolean(data.title && (data.body || data.message)) ||
    Boolean(data.notificationId);
  if (!isFcm && !nested) return null;
  return data;
}

/* Public Firebase config for Messaging inside this worker */
try {
  importScripts("/api/push/sw-config");
  fcmLog("service worker loaded");
} catch (e) {
  console.warn("[AJOS SW] sw-config import failed", e);
}

try {
  importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");
  const cfg = self.__FIREBASE_CONFIG__;
  if (cfg && cfg.apiKey && cfg.projectId && cfg.appId && cfg.messagingSenderId) {
    firebase.initializeApp(cfg);
    const messaging = firebase.messaging();
    fcmLog("Firebase initialised");

    messaging.onBackgroundMessage(async (payload) => {
      fcmLog("background payload received");
      const data = (payload && payload.data) || {};
      // Merge notification block if present (should be data-only from server)
      if (payload.notification) {
        data.title = data.title || payload.notification.title;
        data.body = data.body || payload.notification.body;
      }
      await showFcmSystemNotification(data, "AJ OS");
    });

    self.__AJOS_FCM_READY__ = true;
  } else {
    fcmLog("Firebase config incomplete — background handler not attached");
  }
} catch (e) {
  console.warn("[AJOS SW] Firebase messaging init failed", e);
}

async function precacheShell(cache) {
  await Promise.all(
    PRECACHE_URLS.map(async (url) => {
      try {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      } catch {
        /* one missing asset must not block SW install */
      }
    }),
  );
}

function isSupabaseRequest(url) {
  return url.hostname.includes("supabase.co") || url.hostname.includes("supabase.in");
}

function isApiRequest(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/api/");
}

function isAuthRequest(url) {
  return url.pathname.startsWith("/auth/");
}

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".woff") ||
    url.pathname === "/offline.html"
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkOnly(request) {
  return fetch(request);
}

async function networkFirstShell(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await caches.match("/offline.html");
    if (offline) return offline;
    return new Response("You are offline.", {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

self.addEventListener("install", (event) => {
  fcmLog("install");
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => precacheShell(cache)));
});

self.addEventListener("activate", (event) => {
  fcmLog("activate");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              (key.startsWith("bb-os-") || key.startsWith("aj-academy-")) &&
              key !== STATIC_CACHE &&
              key !== SHELL_CACHE,
          )
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isSupabaseRequest(url) || isApiRequest(url) || isAuthRequest(url)) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === "BADGE_SYNC") {
    const n = Math.max(0, Math.floor(Number(event.data.count) || 0));
    badgeCount = n;
    event.waitUntil(applyAppBadge(n));
  }
});

/**
 * Native push fallback for FCM data-only messages.
 *
 * Failure we fixed: previously we SKIPPED FCM here when Firebase was ready,
 * relying only on onBackgroundMessage. Firebase often delivers to onMessage
 * when any AJ OS client exists (even a hidden tab), so no Windows toast appeared
 * until the user refreshed and loaded Supabase in-app rows.
 *
 * Now we show from push as well; showFcmSystemNotification dedupes by tag.
 * Reminder Web Push (non-FCM) still uses this path exclusively.
 */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let raw = null;
      try {
        raw = event.data ? event.data.json() : null;
      } catch {
        raw = null;
      }

      const fcmData = extractFcmData(raw);
      if (fcmData) {
        fcmLog("push event FCM data received");
        await showFcmSystemNotification(fcmData, "AJ OS");
        return;
      }

      // Legacy reminder / non-FCM web push
      let title = "AJ OS";
      let body = "Open AJ OS to view details.";
      let url = "/employee/dashboard";
      let tag = `ajos-${Date.now()}`;
      try {
        if (raw) {
          title = raw.title || title;
          body = raw.body || raw.message || body;
          url = isSafeInternalUrl(raw.url || raw.link_path) ? raw.url || raw.link_path : url;
          tag = String(raw.tag || tag).slice(0, 64);
        }
      } catch {
        /* ignore */
      }
      fcmLog("push event non-FCM notification");
      await self.registration.showNotification(title, {
        body,
        icon: ICON_URL,
        badge: BADGE_URL,
        silent: false,
        renotify: true,
        requireInteraction: true,
        tag,
        data: { url },
      });
      await incrementAppBadge();
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  fcmLog("notification clicked");
  event.notification.close();
  const rawUrl =
    event.notification.data?.targetUrl ||
    event.notification.data?.url ||
    "/employee/notifications";
  const url = isSafeInternalUrl(rawUrl) ? rawUrl : "/employee/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          try {
            if ("navigate" in client && typeof client.navigate === "function") {
              return client.navigate(url).then((c) => (c && "focus" in c ? c.focus() : client.focus()));
            }
          } catch {
            /* fall through */
          }
          client.focus();
          return client.postMessage?.({ type: "AJOS_NAVIGATE", url });
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
