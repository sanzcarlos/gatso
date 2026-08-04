"use client";

import { useEffect } from "react";
import { pruneStaleCache } from "@/lib/offline/db";

/**
 * Registra `public/sw.js` en el navegador (Fase 7 — PWA) y limpia la
 * cache local de IndexedDB de datos antiguos (backlog: retencion de
 * caches locales). Componente cliente sin salida visual, montado una
 * sola vez en `layout.tsx`. El registro del service worker solo se
 * ejecuta en produccion: en `next dev` el codigo se recompila
 * constantemente y un service worker cacheando agresivamente estorbaria
 * al desarrollo (mismo criterio recomendado por la documentacion de
 * Workbox/Next.js para SW manuales); la limpieza de IndexedDB, en
 * cambio, se ejecuta siempre (no depende de que haya un SW activo).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    void pruneStaleCache();

    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("No se pudo registrar el service worker", error);
    });
  }, []);

  return null;
}
