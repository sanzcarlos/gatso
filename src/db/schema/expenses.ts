import { pgTable, uuid, varchar, numeric, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
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

export const expenses = pgTable("expenses", {
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
  expenseDate: date("expense_date").notNull(),
  splitMethod: splitMethodEnum("split_method").notNull().default("equal"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
