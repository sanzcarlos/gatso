// Service worker manual de Gatso (Fase 7 — PWA). No se usa un paquete
// como `next-pwa`/`serwist` (no estaba entre las dependencias del
// proyecto y anadiria un plugin de webpack adicional); esta es una
// implementacion minima y explicita, mas facil de auditar, cubriendo
// exactamente lo que la app necesita: instalabilidad + shell offline +
// notificaciones push (Backlog: "implementar notificaciones push").
//
// Estrategia:
// - Precache de un "app shell" minimo (offline fallback + iconos +
//   manifest) en el evento `install`.
// - Navegaciones (`request.mode === "navigate"`): red primero,
//   guardando en cache cada pagina visitada con exito (Fase 10); si la
//   red falla se sirve esa misma pagina desde cache (aunque este
//   desactualizada) y, si nunca se visito, se cae a `/offline`. Esto
//   permite reabrir paginas de grupos ya vistas (p. ej. tras recargar
//   con el telefono en modo avion) y que el codigo cliente cargue sus
//   datos desde la cache de IndexedDB (`src/lib/offline/db.ts`).
// - Peticiones a `/api/*`: siempre red (nunca cache), estos datos son
//   dinamicos y sensibles (sesion, gastos); nunca deben servirse
//   obsoletos desde cache. La resiliencia offline de los datos de la
//   app (grupos, gastos) se gestiona aparte, en IndexedDB desde el
//   propio codigo de React, no en este service worker.
// - Resto de peticiones GET del mismo origen (JS/CSS/imagenes generados
//   por Next.js, y las peticiones RSC que usa el router de Next para
//   navegar entre paginas sin recargar): cache-first con relleno de
//   cache en segundo plano (stale-while-revalidate), ya que los assets
//   de `_next/static` van con hash en el nombre (inmutables por build).
const CACHE_NAME = "gatso-shell-v2";
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
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
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

// Notificaciones push (Web Push API): el payload lo cifra el navegador
// antes de entregarlo aqui (RFC 8291), asi que `event.data` ya llega en
// claro dentro del service worker. El servidor (`src/lib/push/service.ts`)
// envia siempre JSON con `title`/`body`/`url`, sin importes ni nombres de
// personas (contenido no sensible: cualquiera con acceso al dispositivo
// puede ver notificaciones del sistema aunque este bloqueado).
self.addEventListener("push", (event) => {
  let payload = { title: "Gatso", body: "Tienes una notificacion nueva." };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Si el payload no es JSON valido, se usa el titulo/cuerpo genericos.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/" },
    }),
  );
});

// Al pulsar la notificacion: si ya hay una pestana de la app abierta, la
// enfoca y navega a la URL indicada; si no, abre una nueva.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

// El navegador puede rotar el endpoint de una suscripcion (p.ej. tras
// mucho tiempo sin usarse); se intenta re-suscribir con la misma clave
// publica y reenviar al servidor, de forma best-effort (si falla, la
// suscripcion simplemente queda invalida hasta que el usuario reactive
// las notificaciones desde la app).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
        if (!applicationServerKey) return;
        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(subscription.toJSON()),
        });
      } catch {
        // Best-effort: sin sesion activa en este contexto no se puede
        // reintentar de otra forma; el usuario puede reactivarlas desde la app.
      }
    })(),
  );
});
