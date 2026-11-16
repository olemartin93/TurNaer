/* TurNær service worker. Generated at build time by scripts/generate-sw.mjs. */
const VERSION = "__VERSION__";
const BASE = "__BASE__";
const PRECACHE = __PRECACHE__;
const DATA_HOSTS = __DATA_HOSTS__;

const SHELL_CACHE = `turnaer-shell-${VERSION}`;
const DATA_CACHE = "turnaer-data-v1";
const DATA_MAX_ENTRIES = 200;
const OFFLINE_URL = `${BASE}/offline.html`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("turnaer-shell-") && k !== SHELL_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone()).then(() => trimCache(cacheName, DATA_MAX_ENTRIES));
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = (await caches.match(request, { ignoreSearch: true })) || (await caches.match(`${BASE}/`));
    return cached || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (!url.pathname.startsWith(`${BASE}/`) && url.pathname !== BASE) return;
    if (request.mode === "navigate") {
      event.respondWith(handleNavigation(request));
    } else if (url.pathname.startsWith(`${BASE}/_next/static/`) || url.pathname.startsWith(`${BASE}/icons/`)) {
      event.respondWith(cacheFirst(request));
    } else {
      event.respondWith(networkFirst(request, SHELL_CACHE));
    }
    return;
  }

  // Map-independent API data (trips, weather, place names, elevation): network first,
  // falling back to the last copy so the app stays useful offline.
  // Map tiles are deliberately NOT cached (provider tile policies).
  if (DATA_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
  }
});
