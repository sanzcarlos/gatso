import { pgTable, uuid, varchar, timestamp, unique } from "drizzle-orm/pg-core";
import { groups } from "./groups";
import { users } from "./users";

/** Subgrupos dentro de un grupo (ej. "viaje a Roma"). Maximo 32 por grupo. */
export const subgroups = pgTable(
  "subgroups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("subgroups_group_name_unique").on(table.groupId, table.name)],
);

export type Subgroup = typeof subgroups.$inferSelect;
export type NewSubgroup = typeof subgroups.$inferInsert;
