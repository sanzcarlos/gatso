import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Registro generico de "intentos" para rate limiting por clave arbitraria
 * (backlog: "Evaluar rate limiting para registro, creacion/aceptacion de
 * invitaciones y union a grupos, evitando canales de enumeracion"). Se
 * mantiene separado de `auth_attempts` (Fase 4, especifico de login/recover
 * y con su propio enum de accion) para no acoplar ambos mecanismos: aqui
 * `scope` es texto libre (una accion nueva no requiere migrar un enum) y
 * `key` es la clave por la que se cuenta (un alias, un userId o un valor
 * fijo para limites globales sin identidad, ver
 * `src/lib/rate-limit/service.ts`).
 */
export const rateLimitAttempts = pgTable(
  "rate_limit_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: varchar("scope", { length: 32 }).notNull(),
    key: varchar("key", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("rate_limit_attempts_scope_key_created_at_idx").on(table.scope, table.key, table.createdAt)],
);

export type RateLimitAttempt = typeof rateLimitAttempts.$inferSelect;
export type NewRateLimitAttempt = typeof rateLimitAttempts.$inferInsert;
