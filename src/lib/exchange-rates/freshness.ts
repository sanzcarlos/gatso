/** Intervalo minimo entre reintentos de refresco del BCE (6h). */
export const ECB_RETRY_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface EcbFetchAttempt {
  /** ISO 8601. */
  attemptedAt: string;
  status: "success" | "error";
  error?: string;
}

export interface EcbFreshnessInput {
  /** Fecha (YYYY-MM-DD) de la tasa mas reciente ya guardada, o null si nunca se guardo ninguna. */
  latestStoredDate: string | null;
  lastAttempt: EcbFetchAttempt | null;
  now: Date;
}

/**
 * Decide si merece la pena volver a consultar el BCE.
 *
 * La version original solo comparaba `latestStoredDate` contra la fecha
 * de hoy: el BCE no publica tasas nuevas los fines de semana ni festivos,
 * asi que en esos dias `latestStoredDate` nunca llega a igualar "hoy" y
 * cada peticion (cada `getRateToEur`) volvia a golpear al BCE sin
 * necesidad. Ahora, si ya hubo un intento (con exito o sin el) hace menos
 * de `ECB_RETRY_INTERVAL_MS`, no se reintenta aunque la fecha guardada
 * sea antigua.
 */
export function shouldAttemptEcbRefresh({ latestStoredDate, lastAttempt, now }: EcbFreshnessInput): boolean {
  const today = now.toISOString().slice(0, 10);
  if (latestStoredDate === today) return false;
  if (!lastAttempt) return true;

  const elapsedMs = now.getTime() - new Date(lastAttempt.attemptedAt).getTime();
  return elapsedMs >= ECB_RETRY_INTERVAL_MS;
}
