import { pgTable, uuid, varchar, boolean, timestamp, pgEnum, index } from "drizzle-orm/pg-core";

/**
 * Accion sobre la que se registra un intento de autenticacion. Se separan
 * login/recover en el conteo para que agotar el limite de uno no bloquee
 * el otro.
 */
export const authAttemptActionEnum = pgEnum("auth_attempt_action", ["login", "recover"]);

/**
 * Registro de intentos de login/recuperacion (exitosos y fallidos), usado
 * para mitigar fuerza bruta (Fase 4). Se guarda por `username` (la
 * credencial de acceso, no el `displayName` editable; y no por IP: por
 * diseno de privacidad esta app no almacena direcciones IP en ninguna
 * tabla) para no penalizar a otros usuarios detras del mismo NAT/IP.
 */
export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: varchar("username", { length: 32 }).notNull(),
    action: authAttemptActionEnum("action").notNull(),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("auth_attempts_username_action_created_at_idx").on(table.username, table.action, table.createdAt)],
);

export type AuthAttempt = typeof authAttempts.$inferSelect;
export type NewAuthAttempt = typeof authAttempts.$inferInsert;
