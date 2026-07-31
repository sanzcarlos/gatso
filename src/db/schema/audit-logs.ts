import { pgTable, uuid, varchar, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./users";
import { groups } from "./groups";

export const auditActionEnum = pgEnum("audit_action", ["create", "update", "delete"]);

/**
 * Log de auditoria inmutable (Fase 5). La inmutabilidad se refuerza con un
 * trigger SQL (`prevent_audit_logs_mutation`, ver
 * `drizzle/0003_audit_logs_immutable.sql`) que rechaza cualquier UPDATE o
 * DELETE sobre esta tabla directamente en la base de datos, con
 * independencia de la capa de aplicacion.
 */
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id),
  action: auditActionEnum("action").notNull(),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
  beforeData: jsonb("before_data"),
  afterData: jsonb("after_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
