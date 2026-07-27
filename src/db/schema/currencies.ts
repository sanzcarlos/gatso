import { pgTable, varchar, smallint, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Catalogo de monedas soportadas. Independiente del resto del modelo para
 * poder anadir monedas nuevas sin refactorizar (Fase 6). Limite maximo de
 * 16 monedas activas se valida a nivel de aplicacion antes de insertar/activar.
 */
export const currencies = pgTable("currencies", {
  code: varchar("code", { length: 3 }).primaryKey(), // ISO 4217, ej. EUR, USD
  name: varchar("name", { length: 64 }).notNull(),
  symbol: varchar("symbol", { length: 8 }).notNull(),
  decimalDigits: smallint("decimal_digits").notNull().default(2),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Currency = typeof currencies.$inferSelect;
export type NewCurrency = typeof currencies.$inferInsert;
