import { pgTable, uuid, varchar, numeric, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { currencies } from "./currencies";

/**
 * Cache local del tipo de cambio diario de referencia del BCE
 * (https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml), Fase
 * 10. El BCE solo publica el cambio del ultimo dia habil (no un historico
 * por fecha en este endpoint), asi que solo se guarda una fila por
 * moneda y dia de publicacion; `src/lib/exchange-rates/service.ts` decide
 * cuando volver a consultar el BCE (una vez al dia) y usa la ultima fila
 * guardada como fallback si el BCE no esta disponible en ese momento.
 *
 * `rateToEur` es "unidades de `currencyCode` por 1 EUR", el mismo criterio
 * que usa el XML del BCE (el EUR nunca aparece como fila, su tasa es
 * siempre 1 por definicion).
 */
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    currencyCode: varchar("currency_code", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    rateToEur: numeric("rate_to_eur", { precision: 18, scale: 6 }).notNull(),
    asOfDate: date("as_of_date").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("exchange_rates_currency_date_idx").on(table.currencyCode, table.asOfDate)],
);

export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type NewExchangeRate = typeof exchangeRates.$inferInsert;
