import { pgTable, uuid, varchar, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { groups } from "./groups";
import { subgroups } from "./subgroups";
import { users } from "./users";
import { currencies } from "./currencies";

/**
 * Metodo usado para saldar una deuda sugerida por la liquidacion (Fase 9 ampliada).
 * Ampliable sin migrar el modelo: anadir un valor nuevo al enum solo
 * requiere una migracion aditiva (mismo patron que `notificationTypeEnum`).
 */
export const settlementPaymentMethodEnum = pgEnum("settlement_payment_method", ["cash", "bizum", "transfer"]);

/**
 * Registro de que una transaccion sugerida por la liquidacion (Fase 9,
 * `src/lib/settlements/optimize.ts`) se ha efectuado realmente fuera de la
 * app (efectivo, Bizum o transferencia). `getGroupSettlement` resta estos
 * importes de los balances netos antes de volver a calcular el numero
 * minimo de transacciones pendientes (Fase 9 ampliada), de forma que una deuda ya
 * saldada deja de aparecer como pendiente.
 *
 * `subgroupId` reproduce el mismo ambito con el que se calculo la
 * liquidacion marcada como pagada (`NULL` = liquidacion de grupo completo).
 * `currencyCode` es siempre una moneda real usada en gastos (nunca la
 * moneda base sintetica del resumen combinado multi-moneda, que se ajusta
 * automaticamente al recalcularse a partir de las monedas individuales).
 */
export const settlementPayments = pgTable("settlement_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  subgroupId: uuid("subgroup_id").references(() => subgroups.id, { onDelete: "set null" }),
  fromUserId: uuid("from_user_id")
    .notNull()
    .references(() => users.id),
  toUserId: uuid("to_user_id")
    .notNull()
    .references(() => users.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 })
    .notNull()
    .references(() => currencies.code),
  method: settlementPaymentMethodEnum("method").notNull(),
  recordedBy: uuid("recorded_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SettlementPayment = typeof settlementPayments.$inferSelect;
export type NewSettlementPayment = typeof settlementPayments.$inferInsert;
