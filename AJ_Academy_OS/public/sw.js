/* AJ Academy — PWA service worker + FCM background handler */
const CACHE_VERSION = "aj-academy-v7-fcm";
const ICON_QUERY = "?v=3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ICON_URL = `/icons/icon-192x192.png${ICON_QUERY}`;

const PRECACHE_URLS = [
  "/offline.html",
  ICON_URL,
  `/icons/icon-512x512.png${ICON_QUERY}`,
  `/icons/maskable-icon-512x512.png${ICON_QUERY}`,
  `/apple-touch-icon.png${ICON_QUERY}`,
  `/favicon.ico${ICON_QUERY}`,
];

function fcmLog(...args) {
  try {
    if (self.__AJOS_FCM_DEBUG__) console.log("[AJOS SW]", ...args);
  } catch {
    /* ignore */
  }
}

/* Public Firebase config for Messaging inside this worker */
try {
  importScripts("/api/push/sw-config");
  fcmLog("Worker loaded; config script imported");
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
    messaging.onBackgroundMessage((payload) => {
      fcmLog("Background payload received");
      const data = (payload && payload.data) || {};
      const title = data.title || (payload.notification && payload.notification.title) || "AJ OS";
      const body =
        data.body || (payload.notification && payload.notification.body) || "Open AJ OS to view details.";
      const rawUrl = data.url || data.targetUrl || "/employee/dashboard";
      const url = isSafeInternalUrl(rawUrl) ? rawUrl : "/employee/dashboard";
      const tag = String(data.tag || data.notificationId || data.type || "ajos-fcm").slice(0, 64);
      return self.registration.showNotification(title, {
        body,
        icon: ICON_URL,
        badge: ICON_URL,
        tag,
        renotify: true,
        silent: false,
        data: {
          url,
          notificationId: data.notificationId || "",
          type: data.type || "",
          source: data.source || "ajos-fcm",
        },
      }).then(() => fcmLog("Notification displayed"));
    });
    fcmLog("Firebase messaging initialised");
    self.__AJOS_FCM_READY__ = true;
  } else {
    fcmLog("Firebase config incomplete — FCM background handler skipped");
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
    const response = await fetch(request);
    return response;
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
    return;
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/**
 * Reminder Web Push (non-FCM) only.
 * FCM is handled by onBackgroundMessage above — do not double-show.
 */
function resolvePushPayload(event) {
  const defaults = {
    title: "AJ OS",
    body: "",
    url: "/employee/dashboard",
    tag: "ajos",
    source: "",
  };
  try {
    if (!event.data) return defaults;
    const raw = event.data.json();
    if (
      self.__AJOS_FCM_READY__ &&
      (raw?.from || raw?.fcmMessageId || raw?.data?.source === "ajos-fcm" || raw?.source === "ajos-fcm")
    ) {
      return { ...defaults, source: "ajos-fcm-skip" };
    }
    const data = raw?.data && typeof raw.data === "object" ? { ...raw, ...raw.data } : raw;
    return {
      title: data.title || raw.notification?.title || defaults.title,
      body: data.body || data.message || raw.notification?.body || defaults.body,
      url: data.url || data.link_path || data.click_action || defaults.url,
      tag: data.tag || data.notificationId || data.type || defaults.tag,
      source: data.source || "",
      notificationId: data.notificationId || "",
      type: data.type || "",
    };
  } catch {
    try {
      const text = event.data?.text?.() || "";
      if (text) return { ...defaults, body: text.slice(0, 180) };
    } catch {
      /* ignore */
    }
    return defaults;
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

self.addEventListener("push", (event) => {
  const payload = resolvePushPayload(event);
  if (payload.source === "ajos-fcm-skip") {
    fcmLog("push event skipped (FCM handled by onBackgroundMessage)");
    return;
  }
  const targetUrl = isSafeInternalUrl(payload.url) ? payload.url : "/employee/dashboard";
  event.waitUntil(
    self.registration.showNotification(payload.title || "AJ OS", {
      body: payload.body || "Open AJ OS to view details.",
      icon: ICON_URL,
      badge: ICON_URL,
      tag: String(payload.tag || "ajos").slice(0, 64),
      renotify: true,
      silent: false,
      data: {
        url: targetUrl,
        notificationId: payload.notificationId || "",
        type: payload.type || "",
        source: payload.source || "",
      },
    }).then(() => fcmLog("Reminder/local push notification displayed")),
  );
});

self.addEventListener("notificationclick", (event) => {
  fcmLog("Notification clicked");
  event.notification.close();
  const rawUrl = event.notification.data?.url || "/employee/dashboard";
  const url = isSafeInternalUrl(rawUrl) ? rawUrl : "/employee/dashboard";
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
