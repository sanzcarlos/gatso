import { env } from "@/lib/env";

/**
 * Configuracion de Web Push (par de claves VAPID). Mismo criterio que
 * `src/lib/imports/splitwise/config.ts`: las claves son opcionales a
 * nivel de esquema global para no romper build/CI en entornos sin
 * configurar, pero cualquier intento real de usarlas debe comprobarse
 * aqui en tiempo de ejecucion.
 */
export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function isPushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

/** Devuelve la configuracion si esta disponible, o `null` si el entorno no tiene las claves VAPID. Nunca lanza. */
export function getPushConfig(): PushConfig | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT };
}
