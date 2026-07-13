/* Service worker: offline app shell + map tile cache.
   Bump CACHE_VERSION on every deploy that changes shell files. */

const CACHE_VERSION = "v2.4.0";
const SHELL_CACHE = `japan-map-shell-${CACHE_VERSION}`;
const TILE_CACHE = "japan-map-tiles";
const MAX_TILES = 800; // ~30-60MB; enough for the whole itinerary at street zoom

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css",
  "./js/data.js",
  "./js/app.js",
  "./js/install.js",
  "./js/store.js",
  "./js/firebase-config.js",
  "./vendor/firebase/firebase-app.js",
  "./vendor/firebase/firebase-firestore.js",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/images/layers.png",
  "./vendor/leaflet/images/layers-2x.png",
  "./vendor/leaflet/images/marker-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

const TILE_HOSTS = ["basemaps.cartocdn.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // no-cache: revalidate with the server so a version bump can never
      // precache stale files out of the browser's HTTP cache
      .then((cache) =>
        cache.addAll(SHELL_ASSETS.map((u) => new Request(u, { cache: "no-cache" })))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("japan-map-shell-") && k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // Firestore writes etc. go straight through

  const url = new URL(req.url);

  // Firebase/Firestore traffic: never intercept — the SDK has its own
  // offline persistence and long-polling streams that break if cached.
  if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com")) {
    return;
  }

  // Map tiles: cache-first, then network (a tile never changes for our purposes)
  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    event.respondWith(tileCacheFirst(req));
    return;
  }

  // Page navigations: network-first so deploys show up immediately,
  // cached shell as the offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req, { cache: "no-cache" })
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Same-origin static assets: cache-first (precached at install),
  // falling back to network + cache for anything new.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
  }
});

async function tileCacheFirst(req) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.put(req, res.clone());
      trimTileCache(cache); // fire-and-forget
    }
    return res;
  } catch (err) {
    // Offline and tile not cached: return a blank tile so Leaflet
    // shows empty ground instead of broken-image squares.
    return new Response(
      Uint8Array.from(atob(BLANK_TILE_B64), (c) => c.charCodeAt(0)),
      { headers: { "Content-Type": "image/png" } }
    );
  }
}

async function trimTileCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_TILES) return;
  // Delete oldest entries (cache.keys() returns insertion order)
  const excess = keys.length - MAX_TILES;
  await Promise.all(keys.slice(0, excess).map((k) => cache.delete(k)));
}

// 1x1 transparent PNG
const BLANK_TILE_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
