/* AJ Academy — PWA service worker (static assets only) */
const CACHE_VERSION = "aj-academy-v6-fcm";
const ICON_QUERY = "?v=3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

const PRECACHE_URLS = [
  "/offline.html",
  `/icons/icon-192x192.png${ICON_QUERY}`,
  `/icons/icon-512x512.png${ICON_QUERY}`,
  `/icons/maskable-icon-512x512.png${ICON_QUERY}`,
  `/apple-touch-icon.png${ICON_QUERY}`,
  `/favicon.ico${ICON_QUERY}`,
];

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
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => precacheShell(cache)),
  );
});

self.addEventListener("activate", (event) => {
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

  /* Default: network only — do not cache live dashboard HTML or RSC payloads */
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/**
 * Push handling:
 * - Reminder Web Push (JSON payload without source=ajos-fcm) — existing behaviour
 * - Firebase FCM data-only messages (source=ajos-fcm) — showNotification once
 * Avoid Firebase "notification" payloads so the browser does not double-display.
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
    // FCM may nest under data
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
  const targetUrl = isSafeInternalUrl(payload.url) ? payload.url : "/employee/dashboard";
  event.waitUntil(
    self.registration.showNotification(payload.title || "AJ OS", {
      body: payload.body || "Open AJ OS to view details.",
      icon: "/icons/icon-192x192.png?v=3",
      badge: "/icons/icon-192x192.png?v=3",
      tag: String(payload.tag || "ajos").slice(0, 64),
      renotify: true,
      data: {
        url: targetUrl,
        notificationId: payload.notificationId || "",
        type: payload.type || "",
        source: payload.source || "",
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
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
