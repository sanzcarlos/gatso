import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { groups } from "./groups";
import { users } from "./users";

/**
 * Invitacion personal a un grupo (distinta del `invite_code` publico del
 * grupo): genera un enlace unico de un solo uso, valido 24 horas, para que
 * una persona sin cuenta todavia pueda crear su usuario (alias + contrasena)
 * y unirse directamente al grupo que la invito.
 */
export const groupInvitations = pgTable("group_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 64 }).notNull().unique(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByUserId: uuid("used_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GroupInvitation = typeof groupInvitations.$inferSelect;
export type NewGroupInvitation = typeof groupInvitations.$inferInsert;
