// Offline support: the app shell is served from cache and refreshed in the background;
// book packs and pages go to the network first and fall back to the cache when offline.
const VERSION = "bookreel-2fa6e0e836";
const SHELL = [
  "/", "/app.css", "/js/app.js", "/js/cards.js", "/js/art.js", "/js/rules.js", "/js/util.js", "/manifest.webmanifest",
  "/fonts/display_black.woff2", "/fonts/display_extrabold.woff2", "/fonts/literata_regular.woff2", "/fonts/literata_italic.woff2",
  "/fonts/plexmono_medium.woff2", "/fonts/plexmono_regular.woff2", "/icons/icon-192.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    if (req.mode === "navigate") return (await cache.match("/")) || Response.error();
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname === "/apk") return;
  if (req.mode === "navigate" || url.pathname.startsWith("/books/") || url.pathname.startsWith("/api/")) {
    e.respondWith(networkFirst(req));
  } else {
    e.respondWith(staleWhileRevalidate(req));
  }
});
