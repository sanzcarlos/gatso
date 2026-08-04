import { pgTable, uuid, varchar, numeric, date, text, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { groups } from "./groups";
import { subgroups } from "./subgroups";
import { users } from "./users";
import { currencies } from "./currencies";

/**
 * Estrategia de reparto (patron Strategy): el valor determina como se
 * interpretan las filas de expense_shares. Ampliable sin migrar el modelo
 * de expenses (Fase 3).
 */
export const splitMethodEnum = pgEnum("split_method", ["equal", "percentage", "fixed"]);

/**
 * Estado de validacion de un gasto (Fase 4):
 * - "confirmed": estado normal, sin cambios pendientes.
 * - "modified": el propio creador lo ha editado; solo informativo, no
 *   requiere validacion de nadie.
 * - "pending_validation": lo ha editado otro usuario (admin del grupo) y
 *   el creador original debe revisar/validar el cambio antes de que vuelva
 *   a "confirmed".
 */
export const expenseStatusEnum = pgEnum("expense_status", [
  "confirmed",
  "modified",
  "pending_validation",
]);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    subgroupId: uuid("subgroup_id").references(() => subgroups.id, { onDelete: "set null" }),
    payerId: uuid("payer_id")
      .notNull()
      .references(() => users.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currencyCode: varchar("currency_code", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    description: varchar("description", { length: 280 }).notNull(),
    /**
     * Comentario/nota libre opcional del gasto (ej. detalle de que se
     * compro, o el campo "Notes" de un gasto importado de Splitwise, ver
     * `src/lib/imports/splitwise/job-service.ts`). Distinto de
     * `description` (obligatoria, es el titulo corto del gasto).
     */
    notes: text("notes"),
    expenseDate: date("expense_date").notNull(),
    splitMethod: splitMethodEnum("split_method").notNull().default("equal"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    status: expenseStatusEnum("status").notNull().default("confirmed"),
    lastEditedBy: uuid("last_edited_by").references(() => users.id),
    /**
     * Id generado por el cliente (Fase 10, cola offline) para poder
     * reenviar `POST /api/groups/:groupId/expenses` de forma idempotente:
     * un reintento con el mismo `clientRequestId` nunca crea un segundo
     * gasto duplicado (ver `createExpense`). `NULL` para gastos creados
     * online (Postgres permite multiples NULL en un indice UNIQUE).
     */
    clientRequestId: varchar("client_request_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("expenses_client_request_id_idx").on(table.clientRequestId)],
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;

/**
 * Reparto de un gasto entre usuarios. La suma de share_amount de todas las
 * filas de un expense debe coincidir exactamente con expenses.amount
 * (validado en la capa de servicio antes de persistir, Fase 3).
 */
export const expenseShares = pgTable(
  "expense_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    shareAmount: numeric("share_amount", { precision: 12, scale: 2 }).notNull(),
    sharePercentage: numeric("share_percentage", { precision: 5, scale: 2 }),
  },
  () => [],
);

export type ExpenseShare = typeof expenseShares.$inferSelect;
export type NewExpenseShare = typeof expenseShares.$inferInsert;
