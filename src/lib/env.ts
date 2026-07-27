import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(16),
  AUTH_COOKIE_NAME: z.string().default("gatso_session"),
  RATE_LIMIT_EXPENSE_CREATION_SECONDS: z.coerce.number().int().positive().default(30),
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
