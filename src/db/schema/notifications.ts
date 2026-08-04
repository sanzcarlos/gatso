import { pgTable, uuid, varchar, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";
import { groups } from "./groups";
import { expenses } from "./expenses";

/**
 * Tipos de notificacion soportados (Fase 4). Ampliable sin migrar el
 * modelo: anadir un valor nuevo al enum solo requiere una migracion aditiva.
 */
export const notificationTypeEnum = pgEnum("notification_type", [
  "expense_pending_validation",
  "settlement_payment_recorded",
]);

/**
 * Notificacion dirigida a un usuario. Usada, de momento, para avisar al
 * creador de un gasto de que otro miembro (admin del grupo) lo ha editado y
 * necesita validar el cambio (ver src/lib/expenses/service.ts).
 */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
  expenseId: uuid("expense_id").references(() => expenses.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
