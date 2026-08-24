// Minimal service worker: only enough app-shell precaching for installability
// (Lighthouse's PWA checks) plus a stale-while-revalidate cache for static assets.
// Room data lives on the server, so API routes are excluded below: they must
// always hit the network.
const CACHE_NAME = "pers-shell-v4";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/") return;
  // Never intercept API routes or Next's internal data/RSC requests.
  if (url.pathname.startsWith("/api/")) return;
  // Scripts/workers/wasm (e.g. tesseract.js's OCR worker + core) must be left
  // untouched: cloning their response here races with the browser's
  // streaming script compilation and throws "Response body is already
  // used", which this handler used to swallow into a broken empty response.
  if (["script", "worker", "sharedworker"].includes(request.destination))
    return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && !response.redirected) {
            try {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            } catch {
              // Cloning failed (e.g. streamed script compilation already
              // consumed the body) — still serve the real network response.
            }
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
