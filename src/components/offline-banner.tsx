import { WifiOff } from "lucide-react";

/**
 * Aviso mostrado en las pantallas de grupos/gastos cuando el ultimo
 * intento de cargar datos del servidor fallo por falta de conexion
 * (Fase 10 — offline-first). Si `hasCachedData` es true, los datos que
 * se ven en la pantalla vienen de la cache local (ver
 * `src/lib/offline/db.ts`) y pueden estar desactualizados.
 */
export function OfflineBanner({ hasCachedData }: { hasCachedData: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning bg-warning px-3 py-2 text-sm text-warning-foreground">
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" aria-hidden="true" />
      <span>
        {hasCachedData
          ? "Sin conexion: mostrando los ultimos datos guardados en este dispositivo. Puede que falten cambios recientes."
          : "Sin conexion y todavia no hay datos guardados en este dispositivo para esta pantalla."}
      </span>
    </div>
  );
}
