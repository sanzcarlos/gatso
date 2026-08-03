"use client";

import { useEffect, useState } from "react";

/**
 * Estado de conexion del navegador (Fase 10 — offline-first). `navigator
 * .onLine` es una senal basica (true no garantiza que el servidor sea
 * alcanzable, pero false es fiable: el sistema operativo no tiene red).
 * Se usa para decidir cuando mostrar datos cacheados o encolar gastos en
 * vez de fallar directamente.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
