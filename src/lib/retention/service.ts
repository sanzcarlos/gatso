import { and, eq, lt } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, authAttempts, notifications, appConfig } from "@/db";

/**
 * Politica de retencion y limpieza (Backlog: "Definir retencion y
 * limpieza para auth_attempts, notificaciones leidas, tipos de cambio
 * antiguos y caches locales, sin borrar auditoria ni datos financieros
 * necesarios"). Los limites son ajustables en runtime via `app_config`
 * (mismo patron que `expense_creation_rate_limit_seconds`/
 * `auth_rate_limit_*`), con un valor por defecto conservador si no hay
 * fila configurada.
 *
 * Deliberadamente NO se toca aqui `audit_logs` (inmutable por diseno,
 * Fase 5) ni ningun dato financiero (`expenses`, `expense_shares`,
 * `settlement_payments`): esta limpieza solo afecta a datos operativos de
 * corta vida util (intentos de login, notificaciones ya leidas, cache de
 * tipos de cambio superada por una fila mas reciente de la misma moneda).
 */

const AUTH_ATTEMPTS_RETENTION_DAYS_KEY = "auth_attempts_retention_days";
const NOTIFICATIONS_RETENTION_DAYS_KEY = "read_notifications_retention_days";
const EXCHANGE_RATES_RETENTION_DAYS_KEY = "exchange_rates_retention_days";

const DEFAULT_AUTH_ATTEMPTS_RETENTION_DAYS = 90;
const DEFAULT_NOTIFICATIONS_RETENTION_DAYS = 60;
const DEFAULT_EXCHANGE_RATES_RETENTION_DAYS = 90;

async function getConfigDays(key: string, fallback: number): Promise<number> {
  const [row] = await db.select({ value: appConfig.value }).from(appConfig).where(eq(appConfig.key, key)).limit(1);
  if (!row) return fallback;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * Borra intentos de login/recuperacion (Fase 4) mas antiguos que el
 * periodo de retencion. Solo se usan para contar fallos recientes dentro
 * de una ventana corta (15 min por defecto, `auth-rate-limit.ts`), asi
 * que conservarlos mas de unos meses no aporta nada salvo investigacion
 * puntual de incidentes de seguridad.
 */
export async function cleanupAuthAttempts(): Promise<number> {
  const retentionDays = await getConfigDays(AUTH_ATTEMPTS_RETENTION_DAYS_KEY, DEFAULT_AUTH_ATTEMPTS_RETENTION_DAYS);
  const result = await db.delete(authAttempts).where(lt(authAttempts.createdAt, daysAgo(retentionDays))).returning({ id: authAttempts.id });
  return result.length;
}

/**
 * Borra notificaciones YA LEIDAS mas antiguas que el periodo de
 * retencion. Las no leidas nunca se borran automaticamente (el usuario
 * debe poder verlas hasta marcarlas como leidas, sin importar su
 * antiguedad).
 */
export async function cleanupReadNotifications(): Promise<number> {
  const retentionDays = await getConfigDays(NOTIFICATIONS_RETENTION_DAYS_KEY, DEFAULT_NOTIFICATIONS_RETENTION_DAYS);
  const result = await db
    .delete(notifications)
    .where(and(eq(notifications.isRead, true), lt(notifications.createdAt, daysAgo(retentionDays))))
    .returning({ id: notifications.id });
  return result.length;
}

/**
 * Borra filas de `exchange_rates` superadas por una fila mas reciente de
 * la misma moneda y mas antiguas que el periodo de retencion.
 * `getRateToEur` (`src/lib/exchange-rates/service.ts`) solo usa siempre
 * la fila mas reciente por moneda, asi que las filas antiguas son solo
 * historico sin uso funcional. Nunca se borra la fila mas reciente de una
 * moneda aunque sea antigua (evita dejar una moneda sin ninguna tasa
 * utilizable si el BCE lleva mucho tiempo sin publicar esa moneda).
 */
export async function cleanupOldExchangeRates(): Promise<number> {
  const retentionDays = await getConfigDays(EXCHANGE_RATES_RETENTION_DAYS_KEY, DEFAULT_EXCHANGE_RATES_RETENTION_DAYS);
  const cutoff = daysAgo(retentionDays).toISOString().slice(0, 10);
  const result = await db.execute(sql`
    DELETE FROM exchange_rates er
    WHERE er.as_of_date < ${cutoff}
      AND EXISTS (
        SELECT 1 FROM exchange_rates er2
        WHERE er2.currency_code = er.currency_code
          AND er2.as_of_date > er.as_of_date
      )
    RETURNING er.id
  `);
  return result.rows.length;
}

export interface CleanupReport {
  authAttemptsDeleted: number;
  readNotificationsDeleted: number;
  exchangeRatesDeleted: number;
}

/** Ejecuta toda la limpieza de retencion. Pensado para invocarse desde un job programado (ver `src/db/cleanup.ts`). */
export async function runRetentionCleanup(): Promise<CleanupReport> {
  const [authAttemptsDeleted, readNotificationsDeleted, exchangeRatesDeleted] = await Promise.all([
    cleanupAuthAttempts(),
    cleanupReadNotifications(),
    cleanupOldExchangeRates(),
  ]);
  return { authAttemptsDeleted, readNotificationsDeleted, exchangeRatesDeleted };
}
