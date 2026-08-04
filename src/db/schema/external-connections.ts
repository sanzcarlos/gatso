import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Conexion OAuth de un usuario Gatso con un proveedor externo (Fase 11:
 * unicamente "splitwise" por ahora, pero `provider` es texto libre —no un
 * enum de Postgres— para poder anadir un proveedor nuevo sin migrar el
 * esquema, mismo criterio que `auditLogs.entityType`).
 *
 * Los tokens NUNCA se guardan en texto plano: `accessTokenEncrypted`/
 * `refreshTokenEncrypted` son la salida de `src/lib/crypto/secret-box.ts`
 * (AES-256-GCM). No se envian al navegador en ninguna respuesta de API ni
 * se escriben en logs (ver `src/lib/imports/splitwise/*`).
 *
 * `externalUserId` es el identificador opaco del usuario en el proveedor
 * (ej. el `id` numerico de Splitwise), guardado solo como referencia
 * tecnica, nunca su nombre real ni email (principio de minima informacion
 * de Gatso, Fase 1).
 */
export const externalConnections = pgTable(
  "external_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    externalUserId: varchar("external_user_id", { length: 64 }),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenType: varchar("token_type", { length: 32 }).notNull().default("bearer"),
    scope: varchar("scope", { length: 256 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** "active" | "revoked". Texto libre (no enum) por el mismo motivo que `provider`. */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("external_connections_user_provider_idx").on(table.userId, table.provider)],
);

export type ExternalConnection = typeof externalConnections.$inferSelect;
export type NewExternalConnection = typeof externalConnections.$inferInsert;
