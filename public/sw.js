/* Noodle Finance — service worker do app shell */
const VERSION = "v10";
const SHELL_CACHE = `noodle-shell-${VERSION}`;
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/css/base.css",
  "/css/auth.css",
  "/css/app.css",
  "/css/cards.css",
  "/css/reports-settings.css",
  "/css/modals.css",
  "/css/responsive.css",
  "/js/app.js",
  "/js/api.js",
  "/js/charts.js",
  "/js/components.js",
  "/js/icons.js",
  "/js/utils.js",
  "/js/views-overview.js",
  "/js/views-pages.js",
  "/fonts/manrope-latin.woff2",
  "/icons/logo-256.png",
  "/icons/logo.png",
  "/icons/icon-32.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.all(
          SHELL_ASSETS.map(async (asset) => {
            const response = await fetch(asset, { cache: "reload" });
            if (!response.ok) throw new Error(`Falha ao cachear ${asset}`);
            await cache.put(asset, response);
          }),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("noodle-") && key !== SHELL_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("/index.html").then((cached) => cached ?? caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
