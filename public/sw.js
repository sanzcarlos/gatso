// Service worker manual de Gatso (Fase 7 — PWA). No se usa un paquete
// como `next-pwa`/`serwist` (no estaba entre las dependencias del
// proyecto y anadiria un plugin de webpack adicional); esta es una
// implementacion minima y explicita, mas facil de auditar, cubriendo
// exactamente lo que la app necesita: instalabilidad + shell offline.
//
// Estrategia:
// - Precache de un "app shell" minimo (offline fallback + iconos +
//   manifest) en el evento `install`.
// - Navegaciones (`request.mode === "navigate"`): red primero, con
//   fallback a `/offline` si falla (sin red) y no hay nada en cache.
// - Peticiones a `/api/*`: siempre red (nunca cache), estos datos son
//   dinamicos y sensibles (sesion, gastos); nunca deben servirse
//   obsoletos desde cache.
// - Resto de peticiones GET del mismo origen (JS/CSS/imagenes generados
//   por Next.js): cache-first con relleno de cache en segundo plano
//   (stale-while-revalidate), ya que los assets de `_next/static` van
//   con hash en el nombre (inmutables por build).
const CACHE_NAME = "gatso-shell-v1";
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
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
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        return cached ?? (await caches.match(OFFLINE_URL));
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
