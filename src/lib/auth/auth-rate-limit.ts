import { and, count, eq, gte } from "drizzle-orm";
import { db, authAttempts, appConfig } from "@/db";
import { AppError } from "@/lib/errors";

const MAX_ATTEMPTS_CONFIG_KEY = "auth_rate_limit_max_attempts";
const WINDOW_CONFIG_KEY = "auth_rate_limit_window_seconds";

const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_WINDOW_SECONDS = 15 * 60;

type AuthAction = "login" | "recover";

async function getConfigNumber(key: string, fallback: number): Promise<number> {
  const [row] = await db.select({ value: appConfig.value }).from(appConfig).where(eq(appConfig.key, key)).limit(1);
  if (!row) return fallback;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Mitigacion de fuerza bruta (Fase 4) para login y recuperacion de cuenta:
 * cuenta los intentos fallidos recientes de ese username (ventana
 * configurable via `app_config`, 15 minutos por defecto) y bloquea
 * temporalmente (HTTP 429) tras superar el limite (10 intentos por
 * defecto). Se aplica *antes* de comprobar si el username existe
 * realmente, y se registra un intento fallido tanto si el username no
 * existe como si la contrasena/codigo es incorrecto, para no crear un
 * canal lateral que revele que usuarios existen segun cuando empieza a
 * aparecer el 429.
 */
export async function enforceAuthRateLimit(username: string, action: AuthAction): Promise<void> {
  const maxAttempts = await getConfigNumber(MAX_ATTEMPTS_CONFIG_KEY, DEFAULT_MAX_ATTEMPTS);
  const windowSeconds = await getConfigNumber(WINDOW_CONFIG_KEY, DEFAULT_WINDOW_SECONDS);
  const since = new Date(Date.now() - windowSeconds * 1000);

  const [row] = await db
    .select({ value: count() })
    .from(authAttempts)
    .where(
      and(
        eq(authAttempts.username, username),
        eq(authAttempts.action, action),
        eq(authAttempts.success, false),
        gte(authAttempts.createdAt, since),
      ),
    );

  if ((row?.value ?? 0) >= maxAttempts) {
    throw new AppError(429, "Demasiados intentos fallidos. Intentalo de nuevo en unos minutos.", "too_many_attempts");
  }
}

export async function recordAuthAttempt(username: string, action: AuthAction, success: boolean): Promise<void> {
  await db.insert(authAttempts).values({ username, action, success });
}
