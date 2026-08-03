"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { syncPendingExpenses } from "@/lib/offline/sync";

/**
 * Componente sin salida visual (Fase 10 — offline-first), montado una
 * vez en `layout.tsx`. Vigila los eventos `online`/`offline` del
 * navegador: al recuperar conexion, reenvia la cola de gastos creados
 * offline (ver `src/lib/offline/sync.ts`) y avisa con un toast del
 * resultado. Tambien intenta sincronizar al montar (por si quedaron
 * gastos pendientes de una sesion anterior y la app arranca ya online).
 */
export function OfflineSyncManager() {
  useEffect(() => {
    async function runSync() {
      const { synced, failed } = await syncPendingExpenses();
      if (synced > 0) {
        toast.success(synced === 1 ? "1 gasto sincronizado" : `${synced} gastos sincronizados`);
      }
      if (failed > 0) {
        toast.error(
          failed === 1
            ? "1 gasto pendiente no se pudo sincronizar"
            : `${failed} gastos pendientes no se pudieron sincronizar`,
        );
      }
    }

    function handleOnline() {
      toast.info("Conexion recuperada, sincronizando...");
      runSync();
    }

    function handleOffline() {
      toast.warning("Sin conexion: los gastos que crees se guardaran en este dispositivo y se sincronizaran despues.");
    }

    if (navigator.onLine) runSync();

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return null;
}
