import { and, count, eq, gte } from "drizzle-orm";
import { db, rateLimitAttempts, appConfig } from "@/db";
import { AppError } from "@/lib/errors";

/**
 * Rate limiting generico por clave arbitraria (backlog: registro, creacion
 * y aceptacion de invitaciones, union a grupos). Distinto de
 * `src/lib/auth/auth-rate-limit.ts` (especifico de login/recover, cuenta
 * solo intentos fallidos por username): aqui cada caso de uso decide su
 * propio `scope`/`key`/limites, pero todos comparten la misma tabla
 * (`rate_limit_attempts`) y el mismo patron de configuracion en runtime
 * via `app_config` (igual que `expense_creation_rate_limit_seconds` o
 * `auth_rate_limit_*`).
 *
 * Esta app no almacena direcciones IP por diseno de privacidad (Fase 1),
 * asi que la clave de conteo siempre es algo que la propia app ya conoce
 * de otra forma (un username elegido, un `userId` autenticado) o, cuando no
 * hay ninguna identidad disponible (aceptar una invitacion es una ruta
 * publica sin sesion), una clave fija que aplica un limite global a la
 * accion completa: mas tosco que un limite por IP, pero suficiente para
 * frenar un escaneo automatizado de tokens sin violar esa decision de
 * diseno.
 */

async function getConfigNumber(key: string, fallback: number): Promise<number> {
  const [row] = await db.select({ value: appConfig.value }).from(appConfig).where(eq(appConfig.key, key)).limit(1);
  if (!row) return fallback;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface KeyedRateLimitConfig {
  scope: string;
  key: string;
  maxAttemptsConfigKey: string;
  windowSecondsConfigKey: string;
  defaultMaxAttempts: number;
  defaultWindowSeconds: number;
  message: string;
}

/** Lanza `AppError(429, ...)` si `key` ha superado el limite de intentos para `scope` dentro de la ventana configurada. */
export async function enforceKeyedRateLimit(config: KeyedRateLimitConfig): Promise<void> {
  const maxAttempts = await getConfigNumber(config.maxAttemptsConfigKey, config.defaultMaxAttempts);
  const windowSeconds = await getConfigNumber(config.windowSecondsConfigKey, config.defaultWindowSeconds);
  const since = new Date(Date.now() - windowSeconds * 1000);

  const [row] = await db
    .select({ value: count() })
    .from(rateLimitAttempts)
    .where(and(eq(rateLimitAttempts.scope, config.scope), eq(rateLimitAttempts.key, config.key), gte(rateLimitAttempts.createdAt, since)));

  if ((row?.value ?? 0) >= maxAttempts) {
    throw new AppError(429, config.message, "too_many_attempts");
  }
}

export async function recordRateLimitAttempt(scope: string, key: string): Promise<void> {
  await db.insert(rateLimitAttempts).values({ scope, key });
}

/** Clave fija usada por los limites globales (sin identidad disponible, ver comentario de cabecera). */
const GLOBAL_KEY = "global";

// --- Registro de cuenta nueva ---
// Cuenta intentos (exitosos o no) de registrar el MISMO username: no
// evita que se creen muchos usuarios distintos rapidamente (no hay una
// identidad previa que limitar sin usar IP), pero anade friccion a
// intentar squatting/probing repetido de un username concreto.
const REGISTER_SCOPE = "register";

export async function enforceRegistrationRateLimit(username: string): Promise<void> {
  await enforceKeyedRateLimit({
    scope: REGISTER_SCOPE,
    key: username,
    maxAttemptsConfigKey: "registration_rate_limit_max_attempts",
    windowSecondsConfigKey: "registration_rate_limit_window_seconds",
    defaultMaxAttempts: 5,
    defaultWindowSeconds: 15 * 60,
    message: "Demasiados intentos de registro con este usuario. Intentalo de nuevo en unos minutos.",
  });
}

export async function recordRegistrationAttempt(username: string): Promise<void> {
  await recordRateLimitAttempt(REGISTER_SCOPE, username);
}

// --- Creacion de invitaciones personales a grupo ---
// Cuenta por usuario que las crea: evita que una cuenta genere enlaces de
// invitacion sin limite (spam de invitaciones, cada una consumible por
// cualquiera que la reciba).
const INVITATION_CREATE_SCOPE = "invitation_create";

export async function enforceInvitationCreateRateLimit(actingUserId: string): Promise<void> {
  await enforceKeyedRateLimit({
    scope: INVITATION_CREATE_SCOPE,
    key: actingUserId,
    maxAttemptsConfigKey: "invitation_create_rate_limit_max_attempts",
    windowSecondsConfigKey: "invitation_create_rate_limit_window_seconds",
    defaultMaxAttempts: 20,
    defaultWindowSeconds: 60 * 60,
    message: "Has generado demasiadas invitaciones recientemente. Intentalo de nuevo en unos minutos.",
  });
}

export async function recordInvitationCreateAttempt(actingUserId: string): Promise<void> {
  await recordRateLimitAttempt(INVITATION_CREATE_SCOPE, actingUserId);
}

// --- Aceptacion de invitaciones personales ---
// Ruta publica sin sesion: no hay ninguna identidad previa que limitar,
// asi que se aplica un limite GLOBAL a toda la accion (no penaliza a un
// usuario concreto, frena el volumen total de intentos de adivinar un
// token de 32 caracteres validos entre todos los llamantes).
const INVITATION_ACCEPT_SCOPE = "invitation_accept";

export async function enforceInvitationAcceptRateLimit(): Promise<void> {
  await enforceKeyedRateLimit({
    scope: INVITATION_ACCEPT_SCOPE,
    key: GLOBAL_KEY,
    maxAttemptsConfigKey: "invitation_accept_rate_limit_max_attempts",
    windowSecondsConfigKey: "invitation_accept_rate_limit_window_seconds",
    defaultMaxAttempts: 60,
    defaultWindowSeconds: 60,
    message: "Demasiados intentos de aceptar invitaciones en este momento. Intentalo de nuevo en unos segundos.",
  });
}

export async function recordInvitationAcceptAttempt(): Promise<void> {
  await recordRateLimitAttempt(INVITATION_ACCEPT_SCOPE, GLOBAL_KEY);
}

// --- Union a grupo por codigo de invitacion publico ---
// Ruta autenticada: cuenta por usuario que intenta unirse, para frenar
// que una cuenta pruebe codigos al azar rapidamente sin bloquear a otros
// usuarios legitimos que se unen a varios grupos reales en poco tiempo.
const GROUP_JOIN_SCOPE = "join_group";

export async function enforceGroupJoinRateLimit(actingUserId: string): Promise<void> {
  await enforceKeyedRateLimit({
    scope: GROUP_JOIN_SCOPE,
    key: actingUserId,
    maxAttemptsConfigKey: "group_join_rate_limit_max_attempts",
    windowSecondsConfigKey: "group_join_rate_limit_window_seconds",
    defaultMaxAttempts: 20,
    defaultWindowSeconds: 15 * 60,
    message: "Demasiados intentos de union a grupos. Intentalo de nuevo en unos minutos.",
  });
}

export async function recordGroupJoinAttempt(actingUserId: string): Promise<void> {
  await recordRateLimitAttempt(GROUP_JOIN_SCOPE, actingUserId);
}
