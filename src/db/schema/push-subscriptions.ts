import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Suscripciones a notificaciones push (Web Push API), una fila por
 * dispositivo/navegador suscrito. `endpoint` es unico (identifica la
 * suscripcion concreta ante el servicio push del navegador); si el mismo
 * endpoint se vuelve a suscribir (p.ej. tras borrar y reinstalar la PWA)
 * se actualiza en vez de duplicarse (`saveSubscription`, upsert por
 * `endpoint`). `p256dh`/`auth` son las claves publicas de cifrado que
 * exige el protocolo Web Push (RFC 8291) para cifrar el payload de cada
 * notificacion antes de enviarlo al navegador.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: varchar("endpoint", { length: 512 }).notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
