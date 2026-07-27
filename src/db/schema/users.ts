import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

/**
 * Usuarios de la aplicacion.
 *
 * Diseno "minima informacion posible": solo alias (no nombre real),
 * sin email obligatorio, sin almacenamiento de IP. El hash de contrasena
 * usa Argon2id (ver src/lib/auth/password.ts en Fase 1).
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  alias: varchar("alias", { length: 32 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  recoveryCodeHash: varchar("recovery_code_hash", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
