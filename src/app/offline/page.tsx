import { WifiOff } from "lucide-react";

/**
 * Pagina de fallback offline (Fase 7 — PWA). El service worker
 * (`public/sw.js`) precachea esta ruta y la sirve cuando una navegacion
 * falla por falta de red y la respuesta pedida no estaba ya en cache
 * (ej. primera visita a una URL nunca visitada, sin conexion).
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <WifiOff className="size-12 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold text-foreground">Sin conexion</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        No se ha podido cargar esta pagina porque no hay conexion a internet.
        Comprueba tu red e intentalo de nuevo; las paginas que ya visitaste
        antes pueden seguir disponibles desde la cache local.
      </p>
    </main>
  );
}
