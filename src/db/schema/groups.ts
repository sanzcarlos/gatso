import { pgTable, uuid, varchar, smallint, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Grupos de gasto compartido. Limite: 64 personas / 32 subgrupos por grupo
 * (Fase 2). Se guarda el limite en la fila para permitir overrides puntuales
 * sin migracion, aunque el valor por defecto se valida en la capa de servicio.
 */
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 64 }).notNull(),
  inviteCode: varchar("invite_code", { length: 16 }).notNull().unique(),
  maxMembers: smallint("max_members").notNull().default(64),
  maxSubgroups: smallint("max_subgroups").notNull().default(32),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
