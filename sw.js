// Service Worker per EPUB Audiobook PWA
// Strategia Cache-First per asset statici

const CACHE_NAME = "epub-audiobook-v1";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./src/styles.css",
  "./src/main.js",
  "./src/db/storage.js",
  "./src/epub/epubParser.js",
  "./src/audio/ttsEngine.js",
  "./src/audio/mediaSession.js",
  "./src/ui/libraryView.js",
  "./src/ui/playerView.js",
  "./public/icons/icon-192.svg",
  "./public/icons/icon-512.svg",
];

// Install: precaching asset statici
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("SW: Alcuni asset non sono stati precachati:", err);
      });
    })
  );
  self.skipWaiting();
});

// Attivate: pulizia vecchie cache
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Cache-First per asset statici, Network-First per tutto il resto
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora richieste non-GET
  if (request.method !== "GET") return;

  // Ignora richieste a estensioni del browser
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Strategia Cache-First per asset statici dell'app
  if (STATIC_ASSETS.includes(url.pathname) || url.pathname.includes("/src/") || url.pathname.includes("/public/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Per tutto il resto: Network-First con fallback cache
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Messaggi dal client
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});