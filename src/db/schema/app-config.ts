import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

/**
 * Configuracion en runtime (feature flags / limites ajustables sin
 * redeploy). Ej: key='expense_creation_rate_limit_seconds', value='30'.
 */
export const appConfig = pgTable("app_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: varchar("value", { length: 256 }).notNull(),
  description: varchar("description", { length: 256 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppConfig = typeof appConfig.$inferSelect;
export type NewAppConfig = typeof appConfig.$inferInsert;
