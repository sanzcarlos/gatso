import { AppError } from "@/lib/errors";

/**
 * Configuracion de la integracion OAuth con Splitwise (Fase 11).
 * Deliberadamente separado de `src/lib/env.ts`: las credenciales son
 * opcionales a nivel de esquema global (para no romper build/CI en
 * entornos sin la integracion configurada), pero cualquier ruta que
 * intente usarlas de verdad debe fallar aqui con un error claro en vez de
 * silenciosamente continuar con `undefined`.
 */
export interface SplitwiseOAuthConfig {
  clientId: string;
  clientSecret: string;
}

export function getSplitwiseOAuthConfig(): SplitwiseOAuthConfig {
  const clientId = process.env.SPLITWISE_CLIENT_ID;
  const clientSecret = process.env.SPLITWISE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new AppError(
      503,
      "La importacion desde Splitwise no esta configurada en este entorno (faltan SPLITWISE_CLIENT_ID/SPLITWISE_CLIENT_SECRET)",
      "splitwise_not_configured",
    );
  }
  return { clientId, clientSecret };
}

/** Construye la URL de callback OAuth a partir del origen de la peticion actual (soporta dev/Preview/Production sin hardcodear un dominio). */
export function getRedirectUri(requestUrl: string): string {
  return new URL("/api/imports/splitwise/oauth/callback", requestUrl).toString();
}
