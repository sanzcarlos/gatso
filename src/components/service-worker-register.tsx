"use client";

import { useEffect } from "react";

/**
 * Registra `public/sw.js` en el navegador (Fase 7 — PWA). Componente
 * cliente sin salida visual, montado una sola vez en `layout.tsx`. Solo
 * se ejecuta en produccion: en `next dev` el codigo se recompila
 * constantemente y un service worker cacheando agresivamente estorbaria
 * al desarrollo (mismo criterio recomendado por la documentacion de
 * Workbox/Next.js para SW manuales).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("No se pudo registrar el service worker", error);
    });
  }, []);

  return null;
}
