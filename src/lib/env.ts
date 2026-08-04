import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(16),
  AUTH_COOKIE_NAME: z.string().default("gatso_session"),
  RATE_LIMIT_EXPENSE_CREATION_SECONDS: z.coerce.number().int().positive().default(30),
  /**
   * Fase 11 (importacion desde Splitwise): credenciales de la app OAuth
   * registrada en Splitwise y clave de cifrado para los tokens guardados
   * en `external_connections`. Deliberadamente opcionales a nivel de
   * schema (no `min(1)`/obligatorias) para que el build/CI no se rompa en
   * entornos donde todavia no se ha configurado la integracion; las rutas
   * que la usan comprueban su presencia en tiempo de ejecucion (ver
   * `src/lib/imports/splitwise/config.ts`) y devuelven un error claro si
   * falta alguna, en vez de fallar al arrancar toda la aplicacion.
   */
  SPLITWISE_CLIENT_ID: z.string().optional(),
  SPLITWISE_CLIENT_SECRET: z.string().optional(),
  /** Clave AES-256-GCM en hexadecimal (64 caracteres = 32 bytes) para cifrar tokens en reposo. */
  IMPORT_ENCRYPTION_KEY: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Variables de entorno invalidas:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}

export const env = loadEnv();
