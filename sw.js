const CACHE = "meow-gallery-v1";
const APP_SHELL = [
  "/", "/index.html", "/styles.css?v=21", "/bubbles.js?v=21", "/domi.js?v=1", "/app.js?v=21",
  "/manifest.webmanifest", "/vendor/matter.min.js", "/vendor/rough.js",
  "/assets/domi-tray.png", "/assets/domi-icon-192.png", "/assets/domi-icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/index.html")))
  );
});
