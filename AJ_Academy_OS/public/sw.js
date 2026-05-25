/* AJ Academy — PWA service worker (static assets only) */
const CACHE_VERSION = "aj-academy-v4-icons";
const ICON_QUERY = "?v=2";
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
